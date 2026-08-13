import * as turf from '@turf/turf'
import type { Toilet } from '../../types'
import type { ControlPoint } from '../data/controlPoints'

// ==========================================================
// TYPES
// ==========================================================

export interface ControlPointAnalysisResult {
    point: ControlPoint
    nearestToilet: Toilet | null

    straightDistanceMeters: number
    walkingDistanceMeters: number
    walkingDurationSeconds: number

    circuityFactor: number

    isAccessible5Min: boolean
    isAccessible10Min: boolean

    /**
     * true — OSRM реально побудував маршрут
     * false — для цієї точки маршрут не вдалося отримати
     */
    analyzed: boolean
}

export interface AccessibilitySummary {
    totalControlPoints: number
    analyzedControlPoints: number
    failedControlPoints: number

    accessible5MinCount: number
    accessible5MinPercent: number

    accessible10MinCount: number
    accessible10MinPercent: number

    avgStraightDistanceMeters: number
    medianStraightDistanceMeters: number

    avgWalkingDistanceMeters: number
    medianWalkingDistanceMeters: number

    avgWalkingTimeMins: number
    medianWalkingTimeMins: number

    avgCircuityFactor: number
    medianCircuityFactor: number

    results: ControlPointAnalysisResult[]
}

// ==========================================================
// CONFIG
// ==========================================================

/**
 * Використовуємо той самий FOSSGIS foot profile,
 * що й основний застосунок.
 *
 * "/driving/" тут є частиною OSRM-compatible endpoint
 * конкретного routed-foot сервера.
 */
const OSRM_BASE_URL =
    'https://routing.openstreetmap.de/routed-foot/route/v1/driving'

/**
 * Скільки геометрично найближчих туалетів
 * перевіряємо через реальний routing.
 *
 * 3 — хороший компроміс між точністю
 * та кількістю запитів.
 */
const MAX_CANDIDATES = 3

/**
 * Публічний сервер FOSSGIS має обмеження
 * приблизно 1 запит/секунду.
 *
 * Використовуємо 1100 мс для невеликого запасу.
 */
const REQUEST_DELAY_MS = 1100

/**
 * Скільки часу вважаємо "5 хвилинами".
 */
const FIVE_MINUTES_SECONDS = 5 * 60

/**
 * Скільки часу вважаємо "10 хвилинами".
 */
const TEN_MINUTES_SECONDS = 10 * 60

// ==========================================================
// HELPERS
// ==========================================================

const sleep = (
    ms: number
): Promise<void> =>
    new Promise(resolve => {
        setTimeout(resolve, ms)
    })

function median(values: number[]): number {
    if (values.length === 0) {
        return 0
    }

    const sorted = [...values].sort(
        (a, b) => a - b
    )

    const middle =
        Math.floor(sorted.length / 2)

    if (sorted.length % 2 === 0) {
        return (
            (sorted[middle - 1] +
                sorted[middle]) /
            2
        )
    }

    return sorted[middle]
}

// ==========================================================
// OSRM
// ==========================================================

interface OsrmRouteResponse {
    code: string

    routes?: Array<{
        distance: number
        duration: number
    }>
}

/**
 * Отримує реальну пішохідну відстань та час
 * через FOSSGIS routed-foot.
 */
async function fetchOsrmNetworkRoute(
    startLng: number,
    startLat: number,
    endLng: number,
    endLat: number
): Promise<{
    distanceMeters: number
    durationSeconds: number
} | null> {
    try {
        const url =
            `${OSRM_BASE_URL}/` +
            `${startLng},${startLat};` +
            `${endLng},${endLat}` +
            `?overview=false`

        const response =
            await fetch(url)

        if (!response.ok) {
            console.warn(
                `OSRM HTTP ${response.status}`
            )

            return null
        }

        const data =
            await response.json() as OsrmRouteResponse

        if (
            data.code !== 'Ok' ||
            !data.routes?.length
        ) {
            return null
        }

        const route =
            data.routes[0]

        return {
            distanceMeters:
                Math.round(
                    route.distance
                ),

            durationSeconds:
                Math.round(
                    route.duration
                )
        }

    } catch (error) {
        console.warn(
            'OSRM network request error:',
            error
        )

        return null
    }
}

// ==========================================================
// MAIN ANALYSIS
// ==========================================================

/**
 * Оцінює реальну пішохідну доступність
 * контрольних точок Дніпра.
 *
 * Алгоритм:
 *
 * 1. Для кожної контрольної точки знаходимо
 *    3 найближчі туалети за прямою відстанню.
 *
 * 2. Для кожного кандидата послідовно
 *    запитуємо реальний walking route OSRM.
 *
 * 3. Вибираємо кандидата з мінімальною
 *    реальною пішохідною відстанню.
 *
 * 4. Рахуємо:
 *    - пряму відстань;
 *    - пішохідну відстань;
 *    - пішохідний час;
 *    - Circuity Factor;
 *    - доступність за 5 / 10 хв.
 */
export async function
evaluateControlPointsAccessibilityNetwork(
    controlPoints: ControlPoint[],
    toilets: Toilet[]
): Promise<AccessibilitySummary> {
    const validToilets =
        toilets.filter(
            toilet =>
                toilet.latitude != null &&
                toilet.longitude != null
        )

    if (
        validToilets.length === 0 ||
        controlPoints.length === 0
    ) {
        return {
            totalControlPoints:
            controlPoints.length,

            analyzedControlPoints: 0,
            failedControlPoints:
            controlPoints.length,

            accessible5MinCount: 0,
            accessible5MinPercent: 0,

            accessible10MinCount: 0,
            accessible10MinPercent: 0,

            avgStraightDistanceMeters: 0,
            medianStraightDistanceMeters: 0,

            avgWalkingDistanceMeters: 0,
            medianWalkingDistanceMeters: 0,

            avgWalkingTimeMins: 0,
            medianWalkingTimeMins: 0,

            avgCircuityFactor: 0,
            medianCircuityFactor: 0,

            results: []
        }
    }

    const results:
        ControlPointAnalysisResult[] = []

    // ======================================================
    // CONTROL POINTS
    // ======================================================

    for (
        const controlPoint of controlPoints
        ) {
        console.log(
            `GIS: аналіз ${controlPoint.name}`
        )

        const controlPointFeature =
            turf.point([
                controlPoint.longitude,
                controlPoint.latitude
            ])

        // --------------------------------------------------
        // 1. Геометрично найближчі кандидати
        // --------------------------------------------------

        const sortedCandidates =
            validToilets
                .map(toilet => {
                    const toiletFeature =
                        turf.point([
                            toilet.longitude!,
                            toilet.latitude!
                        ])

                    const distance =
                        turf.distance(
                            controlPointFeature,
                            toiletFeature,
                            {
                                units: 'meters'
                            }
                        )

                    return {
                        toilet,
                        straightMeters:
                            Math.round(
                                distance
                            )
                    }
                })
                .sort(
                    (a, b) =>
                        a.straightMeters -
                        b.straightMeters
                )

        const candidates =
            sortedCandidates.slice(
                0,
                MAX_CANDIDATES
            )

        // --------------------------------------------------
        // 2. Реальний OSRM routing
        // --------------------------------------------------

        const networkResults:
            Array<{
                candidate: typeof candidates[number]
                route: {
                    distanceMeters: number
                    durationSeconds: number
                }
            }> = []

        for (
            const candidate of candidates
            ) {
            const route =
                await fetchOsrmNetworkRoute(
                    controlPoint.longitude,
                    controlPoint.latitude,

                    candidate.toilet.longitude!,
                    candidate.toilet.latitude!
                )

            if (route) {
                networkResults.push({
                    candidate,
                    route
                })
            }

            // Дотримуємося rate limit
            // між запитами.
            await sleep(
                REQUEST_DELAY_MS
            )
        }

        // --------------------------------------------------
        // 3. Не вдалося побудувати маршрут
        // --------------------------------------------------

        if (
            networkResults.length === 0
        ) {
            results.push({
                point: controlPoint,

                nearestToilet:
                    candidates[0]?.toilet ??
                    null,

                straightDistanceMeters:
                    candidates[0]?.straightMeters ??
                    0,

                walkingDistanceMeters: 0,
                walkingDurationSeconds: 0,

                circuityFactor: 0,

                isAccessible5Min: false,
                isAccessible10Min: false,

                analyzed: false
            })

            continue
        }

        // --------------------------------------------------
        // 4. Найкращий реальний маршрут
        // --------------------------------------------------

        const bestResult =
            networkResults.reduce(
                (best, current) => {
                    if (
                        current.route
                            .distanceMeters <
                        best.route
                            .distanceMeters
                    ) {
                        return current
                    }

                    return best
                }
            )

        const straightDistance =
            bestResult
                .candidate
                .straightMeters

        const walkingDistance =
            bestResult
                .route
                .distanceMeters

        const walkingDuration =
            bestResult
                .route
                .durationSeconds

        const circuityFactor =
            straightDistance > 0
                ? Number(
                    (
                        walkingDistance /
                        straightDistance
                    ).toFixed(2)
                )
                : 1

        // --------------------------------------------------
        // 5. Результат точки
        // --------------------------------------------------

        results.push({
            point: controlPoint,

            nearestToilet:
            bestResult
                .candidate
                .toilet,

            straightDistanceMeters:
            straightDistance,

            walkingDistanceMeters:
            walkingDistance,

            walkingDurationSeconds:
            walkingDuration,

            circuityFactor,

            isAccessible5Min:
                walkingDuration <=
                FIVE_MINUTES_SECONDS,

            isAccessible10Min:
                walkingDuration <=
                TEN_MINUTES_SECONDS,

            analyzed: true
        })
    }

    // ======================================================
    // AGGREGATION
    // ======================================================

    const successfulResults =
        results.filter(
            result =>
                result.analyzed
        )

    const failedResults =
        results.filter(
            result =>
                !result.analyzed
        )

    if (
        successfulResults.length === 0
    ) {
        return {
            totalControlPoints:
            controlPoints.length,

            analyzedControlPoints: 0,

            failedControlPoints:
            failedResults.length,

            accessible5MinCount: 0,
            accessible5MinPercent: 0,

            accessible10MinCount: 0,
            accessible10MinPercent: 0,

            avgStraightDistanceMeters: 0,
            medianStraightDistanceMeters: 0,

            avgWalkingDistanceMeters: 0,
            medianWalkingDistanceMeters: 0,

            avgWalkingTimeMins: 0,
            medianWalkingTimeMins: 0,

            avgCircuityFactor: 0,
            medianCircuityFactor: 0,

            results
        }
    }

    const accessible5MinCount =
        successfulResults.filter(
            result =>
                result.isAccessible5Min
        ).length

    const accessible10MinCount =
        successfulResults.filter(
            result =>
                result.isAccessible10Min
        ).length

    const straightDistances =
        successfulResults.map(
            result =>
                result.straightDistanceMeters
        )

    const walkingDistances =
        successfulResults.map(
            result =>
                result.walkingDistanceMeters
        )

    const walkingTimes =
        successfulResults.map(
            result =>
                result.walkingDurationSeconds
        )

    const circuityFactors =
        successfulResults.map(
            result =>
                result.circuityFactor
        )

    const sumStraight =
        straightDistances.reduce(
            (sum, value) =>
                sum + value,
            0
        )

    const sumWalking =
        walkingDistances.reduce(
            (sum, value) =>
                sum + value,
            0
        )

    const sumWalkingTime =
        walkingTimes.reduce(
            (sum, value) =>
                sum + value,
            0
        )

    const sumCircuity =
        circuityFactors.reduce(
            (sum, value) =>
                sum + value,
            0
        )

    return {
        totalControlPoints:
        controlPoints.length,

        analyzedControlPoints:
        successfulResults.length,

        failedControlPoints:
        failedResults.length,

        accessible5MinCount,

        accessible5MinPercent:
            Math.round(
                (
                    accessible5MinCount /
                    successfulResults.length
                ) * 100
            ),

        accessible10MinCount,

        accessible10MinPercent:
            Math.round(
                (
                    accessible10MinCount /
                    successfulResults.length
                ) * 100
            ),

        avgStraightDistanceMeters:
            Math.round(
                sumStraight /
                successfulResults.length
            ),

        medianStraightDistanceMeters:
            Math.round(
                median(
                    straightDistances
                )
            ),

        avgWalkingDistanceMeters:
            Math.round(
                sumWalking /
                successfulResults.length
            ),

        medianWalkingDistanceMeters:
            Math.round(
                median(
                    walkingDistances
                )
            ),

        avgWalkingTimeMins:
            Math.round(
                (
                    sumWalkingTime /
                    successfulResults.length
                ) / 60
            ),

        medianWalkingTimeMins:
            Math.round(
                median(walkingTimes) / 60
            ),

        avgCircuityFactor:
            Number(
                (
                    sumCircuity /
                    successfulResults.length
                ).toFixed(2)
            ),

        medianCircuityFactor:
            Number(
                median(
                    circuityFactors
                ).toFixed(2)
            ),

        results
    }
}