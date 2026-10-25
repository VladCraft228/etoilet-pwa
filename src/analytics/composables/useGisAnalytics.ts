import { ref } from 'vue'
import * as turf from '@turf/turf'
import type { Toilet } from '../../types'
import { createBufferPolygons } from '../utils/buffers'
import { calculateGisStats, exportGisReportCsv, exportGisReportHtml } from '../utils/spatialStats'
import { DNIPRO_CONTROL_POINTS } from '../data/controlPoints'
import {
    type AccessibilitySummary,
    evaluateControlPointsAccessibilityNetwork
} from '../utils/accessibility'
import { exportAccessibilityResultsCsv, exportAccessibilityReportHtml } from '../utils/accessibilityReport'
import { exportOptimizationReportHtml, exportOptimizationReportCsv } from '../utils/optimizationReport'
import { runCandidateBenchmark } from '../utils/accessibilityBenchmark'
import {
    evaluateCandidate,
    generateCandidateGrid,
    greedySelectDistinctCandidates,
    snapToWalkableNetwork,
    MAX_SNAP_DISTANCE_METERS,
    MIN_DISTANCE_TO_EXISTING_METERS
} from '../utils/optimization'
import type { OptimizationCandidate, OptimizationSummary } from '../types/optimizationType'

// ==========================================
// 1. УТИЛІТИ КЕШУВАННЯ В LOCALSTORAGE
// ==========================================

const CACHE_KEYS = {
    ACCESSIBILITY: 'etoilet_gis_accessibility_stats',
    OPTIMIZATION: 'etoilet_gis_optimization_summary',
    OSRM_ROUTES: 'etoilet_osrm_network_cache',
    VIRTUAL_TOILETS: 'etoilet_gis_virtual_toilets'
} as const

// Безпечне читання з localStorage
function loadFromStorage<T>(key: string): T | null {
    try {
        const raw = localStorage.getItem(key)
        return raw ? (JSON.parse(raw) as T) : null
    } catch (e) {
        console.warn(`[GIS Cache] Не вдалося зчитати ${key}:`, e)
        return null
    }
}

// Безпечний запис
function saveToStorage(key: string, data: any): void {
    try {
        localStorage.setItem(key, JSON.stringify(data))
    } catch (e) {
        console.warn(`[GIS Cache] Помилка запису в storage для ${key}:`, e)
    }
}

export function useGisAnalytics() {
    const isAnalyticsActive = ref(false)
    const isSimulationMode = ref(false)
    const isCalculatingNetwork = ref(false)
    const networkProgress = ref(0)
    const isOptimizing = ref(false)
    const isOptimizationOutdated = ref(false)
    const optimizationProgress = ref(0)
    const optimizationSummary = ref<OptimizationSummary | null>(
        loadFromStorage<OptimizationSummary>(CACHE_KEYS.OPTIMIZATION)
    )
    const bufferRadiusKm = ref(0.5)
    const virtualToilets = ref<Toilet[]>(
        loadFromStorage<Toilet[]>(CACHE_KEYS.VIRTUAL_TOILETS) || []
    )

    // Допоміжна функція збереження віртуальних точок
    const syncVirtualToiletsStorage = () => {
        saveToStorage(CACHE_KEYS.VIRTUAL_TOILETS, virtualToilets.value)
    }

    const accessibilityNetworkStats = ref<AccessibilitySummary | null>(
        loadFromStorage<AccessibilitySummary>(CACHE_KEYS.ACCESSIBILITY)
    )

    // Хелпер для об'єднання реальних та симульованих точок (DRY)
    const getCombinedToilets = (realToilets: Toilet[]): Toilet[] => [
        ...realToilets,
        ...virtualToilets.value
    ]

    const setBufferRadius = (radiusKm: number) => {
        bufferRadiusKm.value = radiusKm
    }

    const addVirtualToilet = (lng: number, lat: number) => {
        const newVirtual: Toilet = {
            id: `virtual-${Date.now()}`,
            type: 'public',
            status: 'virtual',
            latitude: lat,
            longitude: lng,
            address: `Тестова точка #${virtualToilets.value.length + 1}`,
        }
        virtualToilets.value.push(newVirtual)
        syncVirtualToiletsStorage() // <-- Зберігаємо в кеш
        isOptimizationOutdated.value = true
    }

    const removeVirtualToilet = (id: string) => {
        virtualToilets.value = virtualToilets.value.filter((t) => t.id !== id)
        syncVirtualToiletsStorage() // <-- Зберігаємо в кеш
        isOptimizationOutdated.value = true
    }

    const clearVirtualToilets = () => {
        virtualToilets.value = []
        localStorage.removeItem(CACHE_KEYS.VIRTUAL_TOILETS) // <-- Очищаємо кеш точок
        isOptimizationOutdated.value = true
    }

    const recalculateNetworkAccessibility = async (realToilets: Toilet[]) => {
        isCalculatingNetwork.value = true

        try {
            const stats = await evaluateControlPointsAccessibilityNetwork(
                DNIPRO_CONTROL_POINTS,
                getCombinedToilets(realToilets),
                {
                    maxCandidates: 3,
                    bufferRadiusKm: bufferRadiusKm.value
                },
                (current, total, _message) => {
                    networkProgress.value = Math.round((current / total) * 100)
                }
            )

            accessibilityNetworkStats.value = stats
            saveToStorage(CACHE_KEYS.ACCESSIBILITY, stats)
        } finally {
            isCalculatingNetwork.value = false
        }
    }

    const runAccessibilityBenchmark = async (realToilets: Toilet[]) => {
        return await runCandidateBenchmark(
            DNIPRO_CONTROL_POINTS,
            getCombinedToilets(realToilets),
            [1, 3, 5, 10]
        )
    }

    const optimizeOneToiletPlacement = async (
        realToilets: Toilet[],
        candidates: Array<{ latitude: number; longitude: number }>,
        baseline: AccessibilitySummary,
        onProgress?: (p: number) => void
    ): Promise<OptimizationCandidate[]> => {
        const results: OptimizationCandidate[] = []
        const seenSnapped = new Set<string>()
        const total = candidates.length

        // Отримуємо список контрольних точок, які ще НЕ мали 5-хв або 10-хв доступності
        const uncoveredPoints = baseline.results.filter(
            (r) => !r.isAccessible5Min || !r.isAccessible10Min
        )

        const uncoveredPointCoords = uncoveredPoints.map((p) => ({
            latitude: p.point.latitude,
            longitude: p.point.longitude,
        }))

        for (let i = 0; i < total; i++) {
            const { latitude: lat, longitude: lng } = candidates[i]

            // ШВИДКИЙ ПРОСТОРОВИЙ ФІЛЬТР: кандидат має бути хоча б поряд з однією дефіцитною точкою.
            // Це відсікає більшість вузлів до дорогих OSRM-обчислень без втрати якості пошуку.
            const candPoint = turf.point([lng, lat])
            const isNearUncovered = uncoveredPointCoords.some((point) => {
                const ptPoint = turf.point([point.longitude, point.latitude])
                return turf.distance(candPoint, ptPoint, { units: 'meters' }) <= 1500
            })

            // Якщо кандидат знаходиться занадто далеко від усіх проблемних точок, пропускаємо запити до OSRM
            if (uncoveredPoints.length > 0 && !isNearUncovered) {
                onProgress?.(Math.round(((i + 1) / total) * 100))
                continue
            }

            // ФІЛЬТР СУШІ: прив'язуємо вузол сітки до пішохідної мережі.
            // Якщо найближча дорога далі за 40 м (Дніпро, затоки) — кандидата відкидаємо.
            const snapped = await snapToWalkableNetwork(lat, lng)
            if (!snapped) {
                onProgress?.(Math.round(((i + 1) / total) * 100))
                continue
            }

            // Дублікати після прив'язки (кілька вузлів сітки → одна й та сама дорога)
            const snapKey = `${snapped.latitude.toFixed(5)},${snapped.longitude.toFixed(5)}`
            if (seenSnapped.has(snapKey)) {
                onProgress?.(Math.round(((i + 1) / total) * 100))
                continue
            }
            seenSnapped.add(snapKey)

            // Занадто близько до наявної вбиральні — нового покриття не дасть
            const snappedPoint = turf.point([snapped.longitude, snapped.latitude])
            const tooCloseToExisting = realToilets.some(
                (t) =>
                    t.latitude != null &&
                    t.longitude != null &&
                    turf.distance(snappedPoint, turf.point([t.longitude, t.latitude]), { units: 'meters' }) <
                    MIN_DISTANCE_TO_EXISTING_METERS
            )
            if (tooCloseToExisting) {
                onProgress?.(Math.round(((i + 1) / total) * 100))
                continue
            }

            const { latitude: candLat, longitude: candLng } = snapped

            const virtualToilet: Toilet = {
                id: `opt-${candLat}-${candLng}`,
                type: 'public',
                status: 'virtual',
                latitude: candLat,
                longitude: candLng,
                address: 'Candidate'
            }

            const result = await evaluateControlPointsAccessibilityNetwork(
                DNIPRO_CONTROL_POINTS,
                [...realToilets, virtualToilet]
            )

            results.push(evaluateCandidate(candLat, candLng, baseline, result))
            onProgress?.(Math.round(((i + 1) / total) * 100))
        }

        const greedyResults = greedySelectDistinctCandidates(results, 300)
        return greedyResults.sort((a, b) => b.score - a.score || b.deltaCoverage5 - a.deltaCoverage5)
    }

    const runOptimizationTest = async (
        realToilets: Toilet[]
    ): Promise<OptimizationSummary | null> => {
        isOptimizing.value = true
        optimizationProgress.value = 0
        try {
            // Кандидатна сітка ширша за географію контрольних точок, але не виходить за межі міської території.
            // Це дає простір для пошуку нових локацій без зайвого розширення області й збереження швидкості обчислень.
            const GRID_STEP = 0.008
            const latitudes = DNIPRO_CONTROL_POINTS.map((p) => p.latitude)
            const longitudes = DNIPRO_CONTROL_POINTS.map((p) => p.longitude)
            const BOUNDS = {
                minLatitude: Math.min(...latitudes) - 0.04,
                maxLatitude: Math.max(...latitudes) + 0.04,
                minLongitude: Math.min(...longitudes) - 0.05,
                maxLongitude: Math.max(...longitudes) + 0.05,
            }
            const candidates = generateCandidateGrid(
                BOUNDS.minLatitude, BOUNDS.maxLatitude, BOUNDS.minLongitude, BOUNDS.maxLongitude, GRID_STEP
            )

            const baseline = await evaluateControlPointsAccessibilityNetwork(
                DNIPRO_CONTROL_POINTS,
                realToilets
            )

            const results = await optimizeOneToiletPlacement(
                realToilets,
                candidates,
                baseline,
                (progress) => {
                    optimizationProgress.value = progress
                }
            )

            const top5 = results.slice(0, 5)

            const summary: OptimizationSummary = {
                totalCandidates: candidates.length,
                evaluatedCandidates: results.length,
                generatedAt: new Date().toISOString(),
                params: {
                    gridStepDegrees: GRID_STEP,
                    bounds: BOUNDS,
                    maxSnapDistanceMeters: MAX_SNAP_DISTANCE_METERS,
                    minDistanceToExistingMeters: MIN_DISTANCE_TO_EXISTING_METERS,
                },
                baseline: {
                    coverage5: baseline.accessible5MinPercent,
                    coverage10: baseline.accessible10MinPercent,
                    avgWalkingDistance: baseline.avgWalkingDistanceMeters,
                },
                bestCandidate: top5[0] ?? null,
                topCandidates: top5,
            }


            optimizationSummary.value = summary
            saveToStorage(CACHE_KEYS.OPTIMIZATION, summary)
            return summary
        } catch (error) {
            console.error('❌ Помилка під час симуляції оптимізації:', error)
            return null
        } finally {
            console.groupEnd()
            isOptimizing.value = false
            isOptimizationOutdated.value = false
        }
    }

    const getBuffersGeoJSON = (realToilets: Toilet[]) => {
        return createBufferPolygons(getCombinedToilets(realToilets), bufferRadiusKm.value)
    }

    const getSummaryStats = (realToilets: Toilet[]) => {
        return calculateGisStats(getCombinedToilets(realToilets), bufferRadiusKm.value)
    }

    const downloadCsvReport = (realToilets: Toilet[]) => {
        const combined = getCombinedToilets(realToilets)
        const stats = calculateGisStats(combined, bufferRadiusKm.value)
        exportGisReportCsv(combined, stats)
    }

    const downloadHtmlReport = (realToilets: Toilet[]) => {
        const combined = getCombinedToilets(realToilets)
        const stats = calculateGisStats(combined, bufferRadiusKm.value)
        exportGisReportHtml(combined, stats)
    }

    const downloadAccessibilityCsvReport = (maxCandidates: number = 3) => {
        if (accessibilityNetworkStats.value) {
            exportAccessibilityResultsCsv(accessibilityNetworkStats.value, maxCandidates)
        }
    }

    const downloadAccessibilityHtmlReport = (maxCandidates: number = 3) => {
        if (accessibilityNetworkStats.value) {
            exportAccessibilityReportHtml(accessibilityNetworkStats.value, maxCandidates)
        }
    }

    const downloadOptimizationHtmlReport = (realToilets: Toilet[]) => {
        if (optimizationSummary.value) {
            exportOptimizationReportHtml(
                optimizationSummary.value,
                getCombinedToilets(realToilets),
                accessibilityNetworkStats.value
            )
        }
    }

    const downloadOptimizationCsvReport = (realToilets: Toilet[]) => {
        if (optimizationSummary.value) {
            exportOptimizationReportCsv(optimizationSummary.value, getCombinedToilets(realToilets))
        }
    }

    const clearGisCache = (clearRoutes: boolean = false) => {
        accessibilityNetworkStats.value = null
        optimizationSummary.value = null
        virtualToilets.value = []

        localStorage.removeItem(CACHE_KEYS.ACCESSIBILITY)
        localStorage.removeItem(CACHE_KEYS.OPTIMIZATION)
        localStorage.removeItem(CACHE_KEYS.VIRTUAL_TOILETS)

        if (clearRoutes) {
            localStorage.removeItem(CACHE_KEYS.OSRM_ROUTES)
        }
    }

    return {
        isAnalyticsActive,
        isSimulationMode,
        isCalculatingNetwork,
        networkProgress,
        bufferRadiusKm,
        virtualToilets,
        controlPoints: DNIPRO_CONTROL_POINTS,
        accessibilityNetworkStats,
        clearGisCache,
        setBufferRadius,
        addVirtualToilet,
        removeVirtualToilet,
        clearVirtualToilets,
        recalculateNetworkAccessibility,
        getBuffersGeoJSON,
        isOptimizing,
        isOptimizationOutdated,
        optimizationProgress,
        optimizationSummary,
        runOptimizationTest,
        runAccessibilityBenchmark,
        getSummaryStats,
        downloadCsvReport,
        downloadHtmlReport,
        downloadAccessibilityCsvReport,
        downloadAccessibilityHtmlReport,
        downloadOptimizationHtmlReport,
        downloadOptimizationCsvReport
    }
}