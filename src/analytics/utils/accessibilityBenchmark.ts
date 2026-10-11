import type { Toilet } from '../../types'
import type { ControlPoint } from '../data/controlPoints'
import {
    evaluateControlPointsAccessibilityNetwork,
    type AccessibilitySummary
} from './accessibility'

export interface CandidateBenchmarkResult {
    maxCandidates: number
    summary: AccessibilitySummary
}

export async function runCandidateBenchmark(
    controlPoints: ControlPoint[],
    toilets: Toilet[],
    candidateLimits: number[] = [1, 3, 5, 10]
): Promise<CandidateBenchmarkResult[]> {
    const results: CandidateBenchmarkResult[] = []

    for (const maxCandidates of candidateLimits) {
        console.group(
            `🧪 MAX_CANDIDATES = ${maxCandidates}`
        )

        const summary =
            await evaluateControlPointsAccessibilityNetwork(
                controlPoints,
                toilets,
                { maxCandidates }
            )

        results.push({
            maxCandidates,
            summary
        })

        console.table(
            summary.results.map(result => ({
                id: result.point.id,
                name: result.point.name,
                category: result.point.category,
                straightM: result.straightDistanceMeters,
                walkingM: result.walkingDistanceMeters,
                timeMin: Number(
                    (
                        result.walkingDurationSeconds / 60
                    ).toFixed(1)
                ),
                K: result.circuityFactor,
                access5:
                result.isAccessible5Min,
                access10:
                result.isAccessible10Min,
                analyzed:
                result.analyzed
            }))
        )

        console.groupEnd()
    }

    return results
}