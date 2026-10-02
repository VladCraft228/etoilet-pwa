import type { AccessibilitySummary } from './accessibility'
import type { OptimizationCandidate } from '../types/optimizationType'

export function evaluateCandidate(
    latitude: number,
    longitude: number,
    baseline: AccessibilitySummary,
    result: AccessibilitySummary,
): OptimizationCandidate {
    const improvedPoints = result.results.filter((r) => {
        if (!r.analyzed) return false

        const before = baseline.results.find(
            (b) => b.point.id === r.point.id
        )

        return (
            before?.analyzed === true &&
            r.walkingDistanceMeters < before.walkingDistanceMeters
        )
    }).length

    return {
        latitude,
        longitude,
        coverage5: result.accessible5MinPercent,
        coverage10: result.accessible10MinPercent,
        avgWalkingDistance: result.avgWalkingDistanceMeters,
        avgWalkingTime: result.avgWalkingTimeMins,
        avgCircuity: result.avgCircuityFactor,
        deltaCoverage5:
            result.accessible5MinPercent -
            baseline.accessible5MinPercent,
        deltaCoverage10:
            result.accessible10MinPercent -
            baseline.accessible10MinPercent,
        improvedPoints,
    }
}

export function generateCandidateGrid(
    minLatitude: number,
    maxLatitude: number,
    minLongitude: number,
    maxLongitude: number,
    step: number
): Array<{ latitude: number; longitude: number }> {
    const candidates: Array<{
        latitude: number
        longitude: number
    }> = []

    for (
        let latitude = minLatitude;
        latitude <= maxLatitude;
        latitude += step
    ) {
        for (
            let longitude = minLongitude;
            longitude <= maxLongitude;
            longitude += step
        ) {
            candidates.push({
                latitude: Number(latitude.toFixed(6)),
                longitude: Number(longitude.toFixed(6)),
            })
        }
    }

    return candidates
}