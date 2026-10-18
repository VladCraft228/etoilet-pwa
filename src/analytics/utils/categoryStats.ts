import type { ControlPoint } from '../data/controlPoints'
import type { ControlPointAnalysisResult } from './accessibility'
import { average, median } from './math'

export interface CategoryAccessibilityStats {
    category: ControlPoint['category']
    count: number

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
        const circuityFactors = categoryResults.map(r => r.circuityFactor)

        const accessible5 = categoryResults.filter(r => r.isAccessible5Min).length
        const accessible10 = categoryResults.filter(r => r.isAccessible10Min).length

        return {
            category,
            count: categoryResults.length,
            avgStraight: average(straightDistances),
            medianStraight: median(straightDistances),
            avgWalking: average(walkingDistances),
            medianWalking: median(walkingDistances),
            avgTime: average(walkingTimes),
            medianTime: median(walkingTimes),
            avgCircuity: average(circuityFactors),
            medianCircuity: median(circuityFactors),
            coverage5: categoryResults.length > 0 ? (accessible5 / categoryResults.length) * 100 : 0,
            coverage10: categoryResults.length > 0 ? (accessible10 / categoryResults.length) * 100 : 0,
        }
    })
}