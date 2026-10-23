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

export interface OptimizationParams {
    gridStepDegrees: number
    bounds: { minLatitude: number; maxLatitude: number; minLongitude: number; maxLongitude: number }
    maxSnapDistanceMeters: number
    minDistanceToExistingMeters: number
}

export interface OptimizationSummary {
    totalCandidates: number
    /** Скільки кандидатів дійшло до OSRM-оцінки (після фільтрів води/дублікатів/близькості). */
    evaluatedCandidates?: number
    /** ISO-дата запуску симуляції. */
    generatedAt?: string
    params?: OptimizationParams
    baseline: {
        coverage5: number
        coverage10: number
        avgWalkingDistance: number
    }
    bestCandidate: OptimizationCandidate | null
    topCandidates: OptimizationCandidate[]
}