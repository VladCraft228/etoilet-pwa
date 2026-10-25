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
    }

    return results
}