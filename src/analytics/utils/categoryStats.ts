import type { ControlPoint } from '../data/controlPoints'
import type { ControlPointAnalysisResult } from './accessibility'
import { average, median } from './math'

export interface CategoryAccessibilityStats {
    category: ControlPoint['category']
    count: number
    n: number

    // Метрики звивистості (Circuity)
    avgStraight: number
    medianStraight: number
    avgWalking: number
    medianWalking: number
    avgCircuity: number
    medianCircuity: number

    // Часові метрики
    avgTime: number
    medianTime: number

    // Фіксовані стандарти доступності (400м / 800м)
    coverage5: number  // % точок <= 5 хв (до 400м)
    coverage10: number // % точок <= 10 хв (до 800м)
    coverage5Ci95: [number, number]
    coverage10Ci95: [number, number]
}

function proportion95Ci(pct: number, n: number): [number, number] {
    if (n <= 0) return [0, 0]

    const p = Math.min(0.9999, Math.max(0.0001, pct / 100))
    const z = 1.96
    const denom = 1 + (z ** 2 / n)
    const center = (p + (z ** 2) / (2 * n)) / denom
    const margin = (z * Math.sqrt((p * (1 - p) + (z ** 2) / (4 * n)) / n)) / denom

    return [Math.max(0, (center - margin) * 100), Math.min(100, (center + margin) * 100)]
}

export function calculateCategoryAccessibilityStats(
    results: ControlPointAnalysisResult[]
): CategoryAccessibilityStats[] {
    const groups = new Map<ControlPoint['category'], ControlPointAnalysisResult[]>()

    for (const result of results) {
        if (!result.analyzed) continue
        const category = result.point.category
        if (!groups.has(category)) groups.set(category, [])
        groups.get(category)!.push(result)
    }

    return Array.from(groups.entries()).map(([category, categoryResults]) => {
        const straightDistances = categoryResults.map(r => r.straightDistanceMeters)
        const walkingDistances = categoryResults.map(r => r.walkingDistanceMeters)
        const walkingTimes = categoryResults.map(r => r.walkingDurationSeconds)
        const networkLikeResults = categoryResults.filter(
            r => r.routeSource === 'osrm' || r.routeSource === 'correction'
        )
        const circuityFactors = networkLikeResults.map(r => r.circuityFactor)

        const accessible5 = categoryResults.filter(r => r.isAccessible5Min).length
        const accessible10 = categoryResults.filter(r => r.isAccessible10Min).length
        const coverage5 = categoryResults.length > 0 ? (accessible5 / categoryResults.length) * 100 : 0
        const coverage10 = categoryResults.length > 0 ? (accessible10 / categoryResults.length) * 100 : 0

        return {
            category,
            count: categoryResults.length,
            n: categoryResults.length,
            avgStraight: average(straightDistances),
            medianStraight: median(straightDistances),
            avgWalking: average(walkingDistances),
            medianWalking: median(walkingDistances),
            avgTime: average(walkingTimes),
            medianTime: median(walkingTimes),
            avgCircuity: circuityFactors.length > 0 ? average(circuityFactors) : 0,
            medianCircuity: circuityFactors.length > 0 ? median(circuityFactors) : 0,
            coverage5,
            coverage10,
            coverage5Ci95: proportion95Ci(coverage5, categoryResults.length),
            coverage10Ci95: proportion95Ci(coverage10, categoryResults.length),
        }
    })
}