import type { ControlPoint } from '../data/controlPoints'
import type { ControlPointAnalysisResult } from './accessibility'

export interface CategoryAccessibilityStats {
    category: ControlPoint['category']
    count: number

    avgStraight: number
    medianStraight: number

    avgWalking: number
    medianWalking: number

    avgTime: number
    medianTime: number

    avgCircuity: number
    medianCircuity: number

    coverage5: number
    coverage10: number
}

function average(values: number[]): number {
    if (values.length === 0) return 0

    return values.reduce((sum, value) => sum + value, 0) / values.length
}

function median(values: number[]): number {
    if (values.length === 0) return 0

    const sorted = [...values].sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)

    if (sorted.length % 2 === 0) {
        return (sorted[middle - 1] + sorted[middle]) / 2
    }

    return sorted[middle]
}

export function calculateCategoryAccessibilityStats(
    results: ControlPointAnalysisResult[]
): CategoryAccessibilityStats[] {
    const groups = new Map<
        ControlPoint['category'],
        ControlPointAnalysisResult[]
    >()

    for (const result of results) {
        if (!result.analyzed) continue

        const category = result.point.category

        if (!groups.has(category)) {
            groups.set(category, [])
        }

        groups.get(category)!.push(result)
    }

    return Array.from(groups.entries()).map(
        ([category, categoryResults]) => {
            const straightDistances = categoryResults.map(
                result => result.straightDistanceMeters
            )

            const walkingDistances = categoryResults.map(
                result => result.walkingDistanceMeters
            )

            const walkingTimes = categoryResults.map(
                result => result.walkingDurationSeconds
            )

            const circuityFactors = categoryResults.map(
                result => result.circuityFactor
            )

            const accessible5 = categoryResults.filter(
                result => result.isAccessible5Min
            ).length

            const accessible10 = categoryResults.filter(
                result => result.isAccessible10Min
            ).length

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

                coverage5:
                    (accessible5 / categoryResults.length) * 100,

                coverage10:
                    (accessible10 / categoryResults.length) * 100,
            }
        }
    )
}