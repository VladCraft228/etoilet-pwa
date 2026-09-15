import { ref } from 'vue'
import type { Toilet } from '../../types'
import { createBufferPolygons } from '../utils/buffers'
import { calculateCircuity } from '../utils/circuity'
import { calculateGisStats, exportGisReportCsv } from '../utils/stats'
import { DNIPRO_CONTROL_POINTS } from '../data/controlPoints'
import {
    evaluateControlPointsAccessibilityNetwork,
    exportAccessibilityResultsCsv,
    type AccessibilitySummary,
} from '../utils/accessibility'
import { runCandidateBenchmark } from '../utils/accessibilityBenchmark'
import { evaluateCandidate, generateCandidateGrid } from '../utils/optimization'
import type {OptimizationCandidate, OptimizationSummary} from '../types/optimizationType'

export function useGisAnalytics() {
    const isAnalyticsActive = ref(false)
    const isSimulationMode = ref(false)
    const isCalculatingNetwork = ref(false)
    const isOptimizing = ref(false)
    const optimizationProgress = ref(0)
    const optimizationSummary = ref<OptimizationSummary | null>(null)
    const bufferRadiusKm = ref(0.5)
    const virtualToilets = ref<Toilet[]>([])

    const accessibilityNetworkStats = ref<AccessibilitySummary | null>(null)

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
    }

    const removeVirtualToilet = (id: string) => {
        virtualToilets.value = virtualToilets.value.filter((t) => t.id !== id)
    }

    const clearVirtualToilets = () => {
        virtualToilets.value = []
    }

    const recalculateNetworkAccessibility = async (realToilets: Toilet[]) => {
        isCalculatingNetwork.value = true
        const combinedToilets = [...realToilets, ...virtualToilets.value]

        try {
            const stats = await evaluateControlPointsAccessibilityNetwork(
                DNIPRO_CONTROL_POINTS,
                combinedToilets
            )
            accessibilityNetworkStats.value = stats
        } finally {
            isCalculatingNetwork.value = false
        }
    }

    const runAccessibilityBenchmark = async (realToilets: Toilet[]) => {
        const combinedToilets = [...realToilets, ...virtualToilets.value]

        return await runCandidateBenchmark(
            DNIPRO_CONTROL_POINTS,
            combinedToilets,
            [1, 3, 5, 10]
        )
    }

    const optimizeOneToiletPlacement = async (
        realToilets: Toilet[],
        candidates: Array<{ latitude: number; longitude: number }>,
        onProgress?: (percent: number) => void
    ): Promise<OptimizationCandidate[]> => {
        const baseline = await evaluateControlPointsAccessibilityNetwork(
            DNIPRO_CONTROL_POINTS,
            realToilets
        )

        const results: OptimizationCandidate[] = []
        const BATCH_SIZE = 5

        for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
            const batch = candidates.slice(i, i + BATCH_SIZE)

            // Паралельний розрахунок OSRM для 5 кандидатів одночасно
            await Promise.all(
                batch.map(async (candidate) => {
                    const virtualToilet: Toilet = {
                        id: `optimization-${candidate.latitude}-${candidate.longitude}`,
                        type: 'public', // Для алгоритму важливі лише координати
                        status: 'virtual',
                        latitude: candidate.latitude,
                        longitude: candidate.longitude,
                        address: 'Optimization candidate',
                    }

                    const result = await evaluateControlPointsAccessibilityNetwork(
                        DNIPRO_CONTROL_POINTS,
                        [...realToilets, virtualToilet]
                    )

                    results.push(
                        evaluateCandidate(candidate.latitude, candidate.longitude, baseline, result)
                    )
                })
            )

            // Оновлюємо прогрес після кожного виконаного батчу
            if (onProgress) {
                const processedCount = Math.min(i + BATCH_SIZE, candidates.length)
                onProgress(Math.round((processedCount / candidates.length) * 100))
            }
        }

        return results.sort(
            (a, b) =>
                b.deltaCoverage5 - a.deltaCoverage5 ||
                b.deltaCoverage10 - a.deltaCoverage10 ||
                a.avgWalkingDistance - b.avgWalkingDistance
        )
    }

    const runOptimizationTest = async (
        realToilets: Toilet[]
    ): Promise<OptimizationSummary | null> => {
        // Вмикаємо лоадер
        isOptimizing.value = true
        optimizationProgress.value = 0

        try {
            const candidates = generateCandidateGrid(48.45, 48.48, 35.0, 35.08, 0.01)

            const baseline = await evaluateControlPointsAccessibilityNetwork(
                DNIPRO_CONTROL_POINTS,
                realToilets
            )

            // Передаємо оновлення optimizationProgress у колбек
            const results = await optimizeOneToiletPlacement(
                realToilets,
                candidates,
                (progress) => {
                    optimizationProgress.value = progress
                }
            )

            const top5 = results.slice(0, 5)

            const summary: OptimizationSummary = {
                totalCandidates: candidates.length,
                baseline: {
                    coverage5: baseline.accessible5MinPercent,
                    coverage10: baseline.accessible10MinPercent,
                    avgWalkingDistance: baseline.avgWalkingDistanceMeters,
                },
                bestCandidate: top5[0] ?? null,
                topCandidates: top5,
            }

            optimizationSummary.value = summary
            return summary
        } catch (error) {
            console.error('Optimization error:', error)
            return null
        } finally {
            // Гарантовано вимикаємо лоадер після завершення або у разі помилки
            isOptimizing.value = false
        }
    }

    const getBuffersGeoJSON = (realToilets: Toilet[]) => {
        const combinedToilets = [...realToilets, ...virtualToilets.value]
        return createBufferPolygons(combinedToilets, bufferRadiusKm.value)
    }

    const getSummaryStats = (realToilets: Toilet[]) => {
        const combinedToilets = [...realToilets, ...virtualToilets.value]
        return calculateGisStats(combinedToilets, bufferRadiusKm.value)
    }

    const downloadCsvReport = (realToilets: Toilet[]) => {
        const combinedToilets = [...realToilets, ...virtualToilets.value]
        const stats = calculateGisStats(combinedToilets, bufferRadiusKm.value)
        exportGisReportCsv(combinedToilets, stats)
    }

    const downloadAccessibilityCsvReport = (maxCandidates: number = 3) => {
        if (accessibilityNetworkStats.value) {
            exportAccessibilityResultsCsv(accessibilityNetworkStats.value, maxCandidates)
        }
    }

    return {
        isAnalyticsActive,
        isSimulationMode,
        isCalculatingNetwork,
        bufferRadiusKm,
        virtualToilets,
        controlPoints: DNIPRO_CONTROL_POINTS,
        accessibilityNetworkStats,
        setBufferRadius,
        addVirtualToilet,
        removeVirtualToilet,
        clearVirtualToilets,
        recalculateNetworkAccessibility,
        getBuffersGeoJSON,
        calculateCircuity,
        isOptimizing,
        optimizationProgress,
        optimizationSummary,
        runOptimizationTest,
        runAccessibilityBenchmark,
        getSummaryStats,
        downloadCsvReport,
        downloadAccessibilityCsvReport,
    }
}