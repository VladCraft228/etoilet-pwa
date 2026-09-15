export interface OptimizationCandidate {
    latitude: number
    longitude: number
    coverage5: number
    coverage10: number
    deltaCoverage5: number
    deltaCoverage10: number
    avgWalkingDistance: number
    avgWalkingTime: number
    avgCircuity: number
    improvedPoints: number
}

export interface OptimizationSummary {
    totalCandidates: number
    baseline: {
        coverage5: number
        coverage10: number
        avgWalkingDistance: number
    }
    bestCandidate: OptimizationCandidate | null
    topCandidates: OptimizationCandidate[]
}