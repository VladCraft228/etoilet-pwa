/** 'overall' — ціль за загальним покриттям; 'per-category' — кожна категорія має досягти цілі за 5 хв. */
export type OptimizationMode = 'overall' | 'per-category'

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
    /** Нові точки ≤ 5 хв саме в категоріях, що ще не досягли цілі (режим per-category). */
    deltaPriorityCount5?: number
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
    /** Радіуси кілець кандидатів навколо дефіцитних контрольних точок, м. */
    deficitRingRadiiMeters?: number[]
    maxSteps?: number
    mode?: OptimizationMode
}

/** Покриття категорії до та після всіх обраних кроків (кількість точок, без округлення). */
export interface CategoryImpact {
    category: 'park' | 'embankment' | 'transport' | 'pedestrian' | 'shopping'
    n: number
    before5: number
    after5: number
    before10: number
    after10: number
}

export interface OptimizationSummary {
    totalCandidates: number
    /** Скільки кандидатів дійшло до OSRM-оцінки (після фільтрів води/дублікатів/близькості). */
    evaluatedCandidates?: number
    /** ISO-дата запуску симуляції. */
    generatedAt?: string
    /** Чому зупинився пошук. */
    stopReason?: 'target-reached' | 'no-gain' | 'max-steps' | 'no-candidates'
    params?: OptimizationParams
    /** Вплив усіх обраних кроків на покриття за категоріями. */
    categoryImpact?: CategoryImpact[]
    baseline: {
        coverage5: number
        coverage10: number
        avgWalkingDistance: number
    }
    bestCandidate: OptimizationCandidate | null
    topCandidates: OptimizationCandidate[]
}