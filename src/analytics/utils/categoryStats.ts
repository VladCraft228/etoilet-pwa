import type { ControlPoint } from '../data/controlPoints'
import { EUCLID_COVERAGE_5_METERS, EUCLID_COVERAGE_10_METERS, type ControlPointAnalysisResult } from './accessibility'
import { average, median } from './math'

export interface CategoryAccessibilityStats {
    category: ControlPoint['category']
    count: number
    n: number

    // Метрики звивистості (Circuity)
    avgStraight: number
    medianStraight: number
    avgWalking: number
    medianWalking: number
    /** CF лише з маршрутів OSRM; null, якщо у категорії немає жодного такого маршруту. */
    avgCircuity: number | null
    medianCircuity: number | null
    /** Скільки маршрутів OSRM увійшло до CF. */
    circuitySampleSize: number

    // Часові метрики
    avgTime: number
    medianTime: number

    // Фіксовані стандарти доступності (400м / 800м)
    coverage5: number  // % точок <= 5 хв (до 400м)
    coverage10: number // % точок <= 10 хв (до 800м)
    coverage5Ci95: [number, number]
    coverage10Ci95: [number, number]

    // Покриття за прямою (Евклід ≤ 414 / 828 м) — для порівняння з мережею
    euclidCoverage5: number
    euclidCoverage10: number
}

function proportion95Ci(pct: number, n: number): [number, number] {
    if (n <= 0) return [0, 0]

    const p = Math.min(0.9999, Math.max(0.0001, pct / 100))
    const z = 1.96
    const denom = 1 + (z ** 2 / n)
    const center = (p + (z ** 2) / (2 * n)) / denom
    const margin = (z * Math.sqrt((p * (1 - p) + (z ** 2) / (4 * n)) / n)) / denom

    return [Math.max(0, (center - margin) * 100), Math.min(100, (center + margin) * 100)]
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
        // Лише реальні маршрути OSRM: direct/fallback/correction — припущення, а не вимірювання
        const circuityFactors = categoryResults
            .filter(r => r.routeSource === 'osrm')
            .map(r => r.circuityFactor)
        const share = (cnt: number) => (categoryResults.length > 0 ? (cnt / categoryResults.length) * 100 : 0)

        const accessible5 = categoryResults.filter(r => r.isAccessible5Min).length
        const accessible10 = categoryResults.filter(r => r.isAccessible10Min).length
        const coverage5 = categoryResults.length > 0 ? (accessible5 / categoryResults.length) * 100 : 0
        const coverage10 = categoryResults.length > 0 ? (accessible10 / categoryResults.length) * 100 : 0

        return {
            category,
            count: categoryResults.length,
            n: categoryResults.length,
            avgStraight: average(straightDistances),
            medianStraight: median(straightDistances),
            avgWalking: average(walkingDistances),
            medianWalking: median(walkingDistances),
            avgTime: average(walkingTimes),
            medianTime: median(walkingTimes),
            avgCircuity: circuityFactors.length > 0 ? average(circuityFactors) : null,
            medianCircuity: circuityFactors.length > 0 ? median(circuityFactors) : null,
            circuitySampleSize: circuityFactors.length,
            euclidCoverage5: share(categoryResults.filter(r => (r.euclideanNearestMeters ?? Infinity) <= EUCLID_COVERAGE_5_METERS).length),
            euclidCoverage10: share(categoryResults.filter(r => (r.euclideanNearestMeters ?? Infinity) <= EUCLID_COVERAGE_10_METERS).length),
            coverage5,
            coverage10,
            coverage5Ci95: proportion95Ci(coverage5, categoryResults.length),
            coverage10Ci95: proportion95Ci(coverage10, categoryResults.length),
        }
    })
}