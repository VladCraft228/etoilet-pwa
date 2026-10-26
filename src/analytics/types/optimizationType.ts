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
    /** Зменшення середньої довжини маршруту відносно baseline поточного кроку, м. */
    deltaWalkingDistance?: number
    /** Скільки контрольних точок додатково стали доступні за 5 / 10 хв (без округлення відсотків). */
    deltaCount5?: number
    deltaCount10?: number
    n: number
}

export interface OptimizationParams {
    gridStepDegrees: number
    bounds: { minLatitude: number; maxLatitude: number; minLongitude: number; maxLongitude: number }
    maxSnapDistanceMeters: number
    minDistanceToExistingMeters: number
    minCandidateSeparationMeters?: number
    targetCoverage5Percent?: number
    minCoverageGainPercent?: number
    minAverageDistanceGainMeters?: number
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