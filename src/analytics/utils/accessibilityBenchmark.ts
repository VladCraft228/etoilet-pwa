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

export interface CandidateBenchmarkComparison {
    maxCandidates: number
    accessible5MinPercent: number
    accessible10MinPercent: number
    avgWalkingDistanceMeters: number
    medianWalkingDistanceMeters: number
    avgWalkingTimeMins: number
    medianWalkingTimeMins: number
    avgCircuityFactor: number
    medianCircuityFactor: number
    analyzedControlPoints: number
    failedControlPoints: number
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

export function compareCandidateBenchmark(
    benchmark: CandidateBenchmarkResult[]
): CandidateBenchmarkComparison[] {
    return benchmark.map(item => ({
        maxCandidates: item.maxCandidates,

        accessible5MinPercent:
        item.summary.accessible5MinPercent,

        accessible10MinPercent:
        item.summary.accessible10MinPercent,

        avgWalkingDistanceMeters:
        item.summary.avgWalkingDistanceMeters,

        medianWalkingDistanceMeters:
        item.summary.medianWalkingDistanceMeters,

        avgWalkingTimeMins:
        item.summary.avgWalkingTimeMins,

        medianWalkingTimeMins:
        item.summary.medianWalkingTimeMins,

        avgCircuityFactor:
        item.summary.avgCircuityFactor,

        medianCircuityFactor:
        item.summary.medianCircuityFactor,

        analyzedControlPoints:
        item.summary.analyzedControlPoints,

        failedControlPoints:
        item.summary.failedControlPoints
    }))
}