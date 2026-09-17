import {ref} from 'vue'
import type {Toilet} from '../../types'
import {createBufferPolygons} from '../utils/buffers'
import {calculateCircuity} from '../utils/circuity'
import {calculateGisStats, exportGisReportCsv} from '../utils/stats'
import {DNIPRO_CONTROL_POINTS} from '../data/controlPoints'
import {
    type AccessibilitySummary,
    evaluateControlPointsAccessibilityNetwork,
    exportAccessibilityResultsCsv,
} from '../utils/accessibility'
import {runCandidateBenchmark} from '../utils/accessibilityBenchmark'
import {evaluateCandidate, generateCandidateGrid} from '../utils/optimization'
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
            accessibilityNetworkStats.value = await evaluateControlPointsAccessibilityNetwork(
                DNIPRO_CONTROL_POINTS,
                combinedToilets
            )
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
        baseline: AccessibilitySummary,
        onProgress?: (percent: number) => void
    ): Promise<OptimizationCandidate[]> => {
        const results: OptimizationCandidate[] = []

        // Послідовний прохід по кандидатах для запобігання rate-limit / 502 OSRM
        for (let i = 0; i < candidates.length; i++) {
            const candidate = candidates[i]

            const virtualToilet: Toilet = {
                id: `optimization-${candidate.latitude}-${candidate.longitude}`,
                type: 'public',
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

            if (onProgress) {
                onProgress(Math.round(((i + 1) / candidates.length) * 100))
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
        isOptimizing.value = true
        optimizationProgress.value = 0

        try {
            const candidates = generateCandidateGrid(48.45, 48.48, 35.0, 35.08, 0.01)

            // 1. Обчислюємо baseline один раз тут
            const baseline = await evaluateControlPointsAccessibilityNetwork(
                DNIPRO_CONTROL_POINTS,
                realToilets
            )

            // 2. Передаємо вже готовий baseline у функцію
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