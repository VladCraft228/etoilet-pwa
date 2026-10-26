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
    generateDeficitCandidates,
    compareOptimizationCandidates,
    computeCategoryImpact,
    getDeficientCategories,
    snapToWalkableNetwork,
    MAX_SNAP_DISTANCE_METERS,
    MIN_DISTANCE_TO_EXISTING_METERS
} from '../utils/optimization'
import type { ControlPoint } from '../data/controlPoints'
import type { OptimizationCandidate, OptimizationMode, OptimizationSummary } from '../types/optimizationType'

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
        selectedCandidates: OptimizationCandidate[] = [],
        minSeparationMeters: number = 300,
        priorityCategories: ReadonlySet<ControlPoint['category']> | null = null,
        onProgress?: (p: number) => void
    ): Promise<{ ranked: OptimizationCandidate[]; evaluatedKeys: string[] }> => {
        const results: OptimizationCandidate[] = []
        const evaluatedKeys: string[] = []
        const seenSnapped = new Set<string>()
        const total = candidates.length
        // Кандидат змінює лише ті контрольні точки, для яких він потрапляє в N найближчих вбиралень;
        // решта береться з baseline без жодного запиту до OSRM.
        const knownToiletIds = new Set(realToilets.map((t) => String(t.id)))

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
            const tooCloseToSelected = selectedCandidates.some((selected) =>
                turf.distance(
                    snappedPoint,
                    turf.point([selected.longitude, selected.latitude]),
                    { units: 'meters' }
                ) < minSeparationMeters
            )
            if (tooCloseToSelected) {
                onProgress?.(Math.round(((i + 1) / total) * 100))
                continue
            }

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
                [...realToilets, virtualToilet],
                { reuseBaseline: { summary: baseline, knownToiletIds } }
            )

            results.push(evaluateCandidate(candLat, candLng, baseline, result, priorityCategories))
            evaluatedKeys.push(snapKey)
            onProgress?.(Math.round(((i + 1) / total) * 100))
        }

        return {
            ranked: results.sort(compareOptimizationCandidates),
            evaluatedKeys,
        }
    }

    const runOptimizationTest = async (
        realToilets: Toilet[],
        mode: OptimizationMode = 'overall'
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

            const initialToilets = getCombinedToilets(realToilets)
            const initialBaseline = await evaluateControlPointsAccessibilityNetwork(
                DNIPRO_CONTROL_POINTS,
                initialToilets
            )

            const TARGET_COVERAGE_5_PERCENT = 80
            const MIN_COVERAGE_GAIN_PERCENT = 1
            const DEFICIT_RING_RADII_METERS = [120, 250]
            const MAX_OPTIMIZATION_STEPS = 15
            const MIN_CANDIDATE_SEPARATION_METERS = 300
            const selectedCandidates: OptimizationCandidate[] = []
            let currentToilets = initialToilets
            let baseline = initialBaseline
            const allCandidateKeys = new Set(candidates.map((c) => `${c.latitude.toFixed(6)},${c.longitude.toFixed(6)}`))
            let stopReason: NonNullable<OptimizationSummary['stopReason']> = 'no-candidates'
            // Унікальні вузли сітки (після прив'язки), оцінені хоча б на одному кроці
            const evaluatedNodes = new Set<string>()
            let optimizationStep = 0

            while (true) {
                // overall: ціль за загальним покриттям; per-category: кожна категорія має досягти цілі
                const priorityCategories =
                    mode === 'per-category' ? getDeficientCategories(baseline, TARGET_COVERAGE_5_PERCENT) : null
                const targetReached =
                    priorityCategories !== null
                        ? priorityCategories.size === 0
                        : baseline.accessible5MinPercent >= TARGET_COVERAGE_5_PERCENT
                if (targetReached) {
                    stopReason = 'target-reached'
                    break
                }
                if (selectedCandidates.length >= MAX_OPTIMIZATION_STEPS) {
                    stopReason = 'max-steps'
                    break
                }

                // Кандидати цього кроку: груба сітка + кільця навколо точок, що досі > 5 хв
                const deficitPoints = baseline.results
                    .filter(
                        (r) =>
                            r.analyzed &&
                            !r.isAccessible5Min &&
                            (priorityCategories === null || priorityCategories.has(r.point.category))
                    )
                    .map((r) => ({ latitude: r.point.latitude, longitude: r.point.longitude }))
                const deficitCandidates = generateDeficitCandidates(deficitPoints, DEFICIT_RING_RADII_METERS)
                const roundCandidates = [...candidates, ...deficitCandidates]
                roundCandidates.forEach((c) => allCandidateKeys.add(`${c.latitude.toFixed(6)},${c.longitude.toFixed(6)}`))

                const { ranked, evaluatedKeys } = await optimizeOneToiletPlacement(
                    currentToilets,
                    roundCandidates,
                    baseline,
                    selectedCandidates,
                    MIN_CANDIDATE_SEPARATION_METERS,
                    priorityCategories,
                    (progress) => {
                        const progressRatio = optimizationStep + progress / 100
                        optimizationProgress.value = Math.min(
                            99,
                            Math.round((progressRatio / (progressRatio + 1)) * 100)
                        )
                    }
                )
                evaluatedKeys.forEach((k) => evaluatedNodes.add(k))

                const bestCandidate = ranked[0]
                if (!bestCandidate) {
                    stopReason = 'no-candidates'
                    break
                }

                // Приріст за 5 хв у в. п. з точного лічильника точок, а не з округлених відсотків.
                // Кроки без приросту за 5 хв не додаємо: вони лише «підтягують» 10-хв покриття далеко від цілі.
                const gain5Percent =
                    bestCandidate.deltaCount5 !== undefined && bestCandidate.n > 0
                        ? (bestCandidate.deltaCount5 / bestCandidate.n) * 100
                        : bestCandidate.deltaCoverage5
                const hasGain =
                    mode === 'per-category'
                        ? (bestCandidate.deltaPriorityCount5 ?? 0) >= 1
                        : gain5Percent >= MIN_COVERAGE_GAIN_PERCENT
                if (!hasGain) {
                    stopReason = 'no-gain'
                    break
                }

                selectedCandidates.push(bestCandidate)
                optimizationStep++
                currentToilets = [
                    ...currentToilets,
                    {
                        id: `opt-${bestCandidate.latitude}-${bestCandidate.longitude}`,
                        type: 'public',
                        status: 'virtual',
                        latitude: bestCandidate.latitude,
                        longitude: bestCandidate.longitude,
                        address: `Optimization candidate ${selectedCandidates.length}`,
                    },
                ]

                baseline = await evaluateControlPointsAccessibilityNetwork(
                    DNIPRO_CONTROL_POINTS,
                    currentToilets
                )
            }
            optimizationProgress.value = 100

            const summary: OptimizationSummary = {
                totalCandidates: allCandidateKeys.size,
                evaluatedCandidates: evaluatedNodes.size,
                generatedAt: new Date().toISOString(),
                stopReason,
                params: {
                    gridStepDegrees: GRID_STEP,
                    bounds: BOUNDS,
                    maxSnapDistanceMeters: MAX_SNAP_DISTANCE_METERS,
                    minDistanceToExistingMeters: MIN_DISTANCE_TO_EXISTING_METERS,
                    minCandidateSeparationMeters: MIN_CANDIDATE_SEPARATION_METERS,
                    targetCoverage5Percent: TARGET_COVERAGE_5_PERCENT,
                    minCoverageGainPercent: MIN_COVERAGE_GAIN_PERCENT,
                    deficitRingRadiiMeters: DEFICIT_RING_RADII_METERS,
                    maxSteps: MAX_OPTIMIZATION_STEPS,
                    mode,
                },
                baseline: {
                    coverage5: initialBaseline.accessible5MinPercent,
                    coverage10: initialBaseline.accessible10MinPercent,
                    avgWalkingDistance: initialBaseline.avgWalkingDistanceMeters,
                },
                categoryImpact: computeCategoryImpact(initialBaseline, baseline),
                bestCandidate: selectedCandidates[0] ?? null,
                topCandidates: selectedCandidates,
            }

            optimizationSummary.value = summary
            saveToStorage(CACHE_KEYS.OPTIMIZATION, summary)
            return summary
        } catch (error) {
            console.error('❌ Помилка під час симуляції оптимізації:', error)
            return null
        } finally {
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