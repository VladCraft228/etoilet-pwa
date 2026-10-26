import type { Toilet } from '../../types'
import type { ControlPoint } from '../data/controlPoints'
import { getStraightDistance } from '../../components/utils/geo'
import { median, percentile } from './math'

// ==========================================================
// TYPES
// ==========================================================

export type RouteSource = 'direct' | 'osrm' | 'fallback' | 'correction'

export interface ControlPointAnalysisResult {
    point: ControlPoint
    nearestToilet: Toilet | null
    /** Пряма до ОБРАНОЇ (мережево найближчої) вбиральні. */
    straightDistanceMeters: number
    /** Пряма до найближчої за Евклідом вбиральні (для порівняння «Евклід проти мережі»). */
    euclideanNearestMeters?: number
    walkingDistanceMeters: number
    walkingDurationSeconds: number
    circuityFactor: number
    routeSource: RouteSource
    isAccessible5Min: boolean
    isAccessible10Min: boolean
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
    /** CF рахується ЛИШЕ з маршрутів OSRM (без direct/fallback/correction). */
    avgCircuityFactor: number
    medianCircuityFactor: number
    p90CircuityFactor?: number
    maxCircuityFactor?: number
    circuitySampleSize?: number
    /** Модель часу: 'distance' = відстань / 1.38 м/с для всіх джерел. Відсутнє у старих результатах (час OSRM). */
    timeModel?: 'distance'
    /** Розподіл за джерелом відстані. */
    sourceCounts?: Record<RouteSource, number>
    /** Покриття, якби ми рахували за прямою (Евклід ≤ 414 / 828 м). */
    euclid5MinCount?: number
    euclid5MinPercent?: number
    euclid10MinCount?: number
    euclid10MinPercent?: number
    /** Точки, «покриті» за Евклідом, але недоступні за мережею. */
    falseCovered5MinCount?: number
    falseCovered10MinCount?: number
    results: ControlPointAnalysisResult[]
}

export interface AccessibilityOptions {
    maxCandidates?: number
    concurrencyLimit?: number
    bufferRadiusKm?: number
    maxRadiusMeters?: number
    /**
     * Прискорення для what-if: точки, чиї N найближчих вбиралень усі вже були в базовому розрахунку,
     * беруться з нього без повторних запитів.
     */
    reuseBaseline?: { summary: AccessibilitySummary; knownToiletIds: Set<string> }
}

interface OsrmRouteResponse {
    code: string
    routes?: Array<{
        distance: number
        duration: number
    }>
}

// ==========================================================
// CONFIG
// ==========================================================

const OSRM_BASE_URL = 'https://routing.openstreetmap.de/routed-foot/route/v1/driving'
export const DEFAULT_MAX_CANDIDATES = 3
const DEFAULT_CONCURRENCY_LIMIT = 1
const REQUEST_DELAY_MS = 350
const FIVE_MINUTES_SECONDS = 5 * 60
const TEN_MINUTES_SECONDS = 10 * 60
const FALLBACK_CIRCUITY_FACTOR = 1.4 // Коефіцієнт для точок без мережевого маршруту
const WALKING_SPEED_MPS = 1.38 // Середня швидкість пішохода м/с
/** Пряма відстань, що відповідає 5/10 хв ходьби — для порівняння з мережею. */
export const EUCLID_COVERAGE_5_METERS = Math.round(FIVE_MINUTES_SECONDS * WALKING_SPEED_MPS) // 414
export const EUCLID_COVERAGE_10_METERS = Math.round(TEN_MINUTES_SECONDS * WALKING_SPEED_MPS) // 828

// Поріг прямої видимості (парки, набережні, площі без розмічених стежок в OSM)
const STRAIGHT_LINE_THRESHOLD_METERS = 180

// ==========================================================
// HELPERS & CACHE
// ==========================================================

const OSRM_CACHE_STORAGE_KEY = 'etoilet_osrm_network_cache_v2'

function loadInitialOsrmCache(): Map<string, { distanceMeters: number; durationSeconds: number } | null> {
    try {
        const raw = localStorage.getItem(OSRM_CACHE_STORAGE_KEY)
        if (raw) {
            const entries = JSON.parse(raw) as Array<[string, { distanceMeters: number; durationSeconds: number } | null]>
            return new Map(entries)
        }
    } catch (e) {
        console.warn('[OSRM Cache] Error loading cache:', e)
    }
    return new Map()
}

const osrmCache = loadInitialOsrmCache()
/** Лічильник реальних HTTP-запитів: затримка потрібна лише після них, а не після влучань у кеш. */
let networkRequestCounter = 0

function persistOsrmCache(): void {
    try {
        const entries = Array.from(osrmCache.entries())
        const limitedEntries = entries.slice(-5000)
        localStorage.setItem(OSRM_CACHE_STORAGE_KEY, JSON.stringify(limitedEntries))
    } catch (e) {
        console.warn('[OSRM Cache] Error saving cache:', e)
    }
}

function getCacheKey(lat1: number, lng1: number, lat2: number, lng2: number): string {
    const start = `${lat1.toFixed(5)},${lng1.toFixed(5)}`
    const end = `${lat2.toFixed(5)},${lng2.toFixed(5)}`
    return start < end ? `${start}->${end}` : `${end}->${start}`
}

async function fetchOsrmRouteRaw(
    startLng: number,
    startLat: number,
    endLng: number,
    endLat: number,
    retries = 3
): Promise<{ distanceMeters: number; durationSeconds: number } | null> {
    try {
        const url = `${OSRM_BASE_URL}/${startLng},${startLat};${endLng},${endLat}?overview=false`
        const response = await fetch(url)

        if (!response.ok) {
            if (response.status === 429 && retries > 0) {
                console.warn('[OSRM] Rate limit hit. Waiting 3 seconds...')
                await new Promise(r => setTimeout(r, 3000))
                return fetchOsrmRouteRaw(startLng, startLat, endLng, endLat, retries - 1)
            }
            console.warn(`[OSRM] HTTP Error ${response.status}`)
            return null
        }

        const data = (await response.json()) as OsrmRouteResponse

        if (data.code !== 'Ok' || !data.routes?.length) {
            return null
        }

        return {
            distanceMeters: Math.round(data.routes[0].distance),
            durationSeconds: Math.round(data.routes[0].duration),
        }
    } catch (error) {
        if (retries > 0) {
            console.warn(`[OSRM Network Error] Retrying in 2.5s... (${retries} left)`)
            await new Promise(r => setTimeout(r, 2500))
            return fetchOsrmRouteRaw(startLng, startLat, endLng, endLat, retries - 1)
        }

        console.warn('[OSRM Network Request Failed]:', error)
        return null
    }
}

async function getRouteWithCache(
    startLng: number,
    startLat: number,
    endLng: number,
    endLat: number
): Promise<{ distanceMeters: number; durationSeconds: number } | null> {
    const key = getCacheKey(startLat, startLng, endLat, endLng)

    if (osrmCache.has(key)) {
        return osrmCache.get(key)!
    }

    networkRequestCounter++
    const result = await fetchOsrmRouteRaw(startLng, startLat, endLng, endLat)
    osrmCache.set(key, result)
    persistOsrmCache()
    return result
}

// ==========================================================
// MAIN ANALYSIS
// ==========================================================

async function processInBatches<T, R>(
    items: T[],
    batchSize: number,
    processor: (item: T) => Promise<R>
): Promise<R[]> {
    const results: R[] = []

    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize)
        results.push(...(await Promise.all(batch.map(processor))))
    }

    return results
}

export async function evaluateControlPointsAccessibilityNetwork(
    controlPoints: ControlPoint[],
    toilets: Toilet[],
    options: AccessibilityOptions = {},
    onProgress?: (current: number, total: number, message: string) => void
): Promise<AccessibilitySummary> {
    const maxCandidates = Math.max(1, Math.floor(options.maxCandidates ?? DEFAULT_MAX_CANDIDATES))
    const concurrencyLimit = options.concurrencyLimit ?? DEFAULT_CONCURRENCY_LIMIT

    const validToilets = toilets.filter((t) => t.latitude != null && t.longitude != null)

    if (validToilets.length === 0 || controlPoints.length === 0) {
        return createEmptySummary(controlPoints.length)
    }

    const controlPointsWithCandidates = controlPoints.map(cp => {
        const candidates = validToilets
            .map(toilet => ({
                toilet,
                dist: getStraightDistance(cp.latitude, cp.longitude, toilet.latitude!, toilet.longitude!)
            }))
            .sort((a, b) => a.dist - b.dist)
            .slice(0, maxCandidates)

        return { cp, candidates }
    })

    let completedCount = 0

    const reuse = options.reuseBaseline
    const baselineById = reuse ? new Map(reuse.summary.results.map((r) => [r.point.id, r])) : null

    const processPoint = async ({ cp, candidates }: typeof controlPointsWithCandidates[0]): Promise<ControlPointAnalysisResult> => {
        // Набір найближчих вбиралень не змінився → результат такий самий, як у базовому розрахунку
        if (reuse && baselineById) {
            const prev = baselineById.get(cp.id)
            if (prev && prev.euclideanNearestMeters !== undefined && candidates.every((c) => reuse.knownToiletIds.has(String(c.toilet.id)))) {
                completedCount++
                onProgress?.(completedCount, controlPoints.length, `Аналіз точки: ${cp.name}`)
                return prev
            }
        }

        const requestsBefore = networkRequestCounter
        let result: ControlPointAnalysisResult

        if (candidates.length === 0) {
            result = {
                point: cp,
                nearestToilet: null,
                straightDistanceMeters: 0,
                walkingDistanceMeters: 0,
                euclideanNearestMeters: 0,
                walkingDurationSeconds: 0,
                circuityFactor: 0,
                routeSource: 'fallback',
                isAccessible5Min: false,
                isAccessible10Min: false,
                analyzed: false,
            }
        } else {
            const nearestCandidate = candidates[0]
            const nearestStraightDistance = Math.round(nearestCandidate.dist)

            if (nearestStraightDistance <= STRAIGHT_LINE_THRESHOLD_METERS) {
                const walkingDuration = Math.round(nearestStraightDistance / WALKING_SPEED_MPS)
                result = {
                    point: cp,
                    nearestToilet: nearestCandidate.toilet,
                    straightDistanceMeters: nearestStraightDistance,
                    euclideanNearestMeters: nearestStraightDistance,
                    walkingDistanceMeters: nearestStraightDistance,
                    walkingDurationSeconds: walkingDuration,
                    circuityFactor: 1.0,
                    routeSource: 'direct',
                    isAccessible5Min: true,
                    isAccessible10Min: true,
                    analyzed: true,
                }
            } else {
                let bestResult: {
                    candidate: typeof candidates[0],
                    route: { distanceMeters: number; durationSeconds: number }
                } | null = null

                for (const candidate of candidates) {
                    const route = await getRouteWithCache(
                        cp.longitude, cp.latitude,
                        candidate.toilet.longitude!, candidate.toilet.latitude!
                    )

                    if (route) {
                        if (!bestResult || route.distanceMeters < bestResult.route.distanceMeters) {
                            bestResult = { candidate, route }
                        }
                    }
                }

                if (!bestResult) {
                    const fallbackDistance = Math.round(nearestStraightDistance * FALLBACK_CIRCUITY_FACTOR)
                    const fallbackDuration = Math.round(fallbackDistance / WALKING_SPEED_MPS)

                    result = {
                        point: cp,
                        nearestToilet: nearestCandidate.toilet,
                        straightDistanceMeters: nearestStraightDistance,
                        euclideanNearestMeters: nearestStraightDistance,
                        walkingDistanceMeters: fallbackDistance,
                        walkingDurationSeconds: fallbackDuration,
                        circuityFactor: FALLBACK_CIRCUITY_FACTOR,
                        routeSource: 'fallback',
                        isAccessible5Min: fallbackDuration <= FIVE_MINUTES_SECONDS,
                        isAccessible10Min: fallbackDuration <= TEN_MINUTES_SECONDS,
                        analyzed: true,
                    }
                } else {
                    const chosenStraightDistance = Math.round(
                        getStraightDistance(
                            cp.latitude,
                            cp.longitude,
                            bestResult.candidate.toilet.latitude!,
                            bestResult.candidate.toilet.longitude!
                        )
                    )

                    let walkingDistance = bestResult.route.distanceMeters
                    // Час завжди = відстань / 1.38 м/с (як для direct/fallback/корекції); власний час OSRM
                    // (~1.25 м/с + штрафи) давав іншу швидкість і несумісні пороги 5/10 хв.
                    let walkingDuration = Math.round(walkingDistance / WALKING_SPEED_MPS)
                    let circuityFactor = chosenStraightDistance > 0
                        ? Number((walkingDistance / chosenStraightDistance).toFixed(2))
                        : 1

                    if (circuityFactor > 2.0 && chosenStraightDistance <= 250) {
                        const correctedDistance = Math.round(chosenStraightDistance * 1.25)
                        const correctedDuration = Math.round(correctedDistance / WALKING_SPEED_MPS)

                        result = {
                            point: cp,
                            nearestToilet: bestResult.candidate.toilet,
                            straightDistanceMeters: chosenStraightDistance,
                            euclideanNearestMeters: nearestStraightDistance,
                            walkingDistanceMeters: correctedDistance,
                            walkingDurationSeconds: correctedDuration,
                            circuityFactor: 1.25,
                            routeSource: 'correction',
                            isAccessible5Min: correctedDuration <= FIVE_MINUTES_SECONDS,
                            isAccessible10Min: correctedDuration <= TEN_MINUTES_SECONDS,
                            analyzed: true,
                        }
                    } else {
                        result = {
                            point: cp,
                            nearestToilet: bestResult.candidate.toilet,
                            straightDistanceMeters: chosenStraightDistance,
                            euclideanNearestMeters: nearestStraightDistance,
                            walkingDistanceMeters: walkingDistance,
                            walkingDurationSeconds: walkingDuration,
                            circuityFactor,
                            routeSource: 'osrm',
                            isAccessible5Min: walkingDuration <= FIVE_MINUTES_SECONDS,
                            isAccessible10Min: walkingDuration <= TEN_MINUTES_SECONDS,
                            analyzed: true,
                        }
                    }
                }
            }
        }

        // Пауза потрібна лише якщо ми реально звертались до OSRM (кеш і пряма видимість — без затримки)
        if (networkRequestCounter > requestsBefore) {
            await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS))
        }

        completedCount++
        onProgress?.(completedCount, controlPoints.length, `Аналіз точки: ${cp.name}`)
        return result
    }

    const results = await processInBatches(
        controlPointsWithCandidates,
        concurrencyLimit,
        processPoint
    )

    return calculateSummary(controlPoints.length, results)
}

function createEmptySummary(totalPoints: number): AccessibilitySummary {
    return {
        totalControlPoints: totalPoints,
        analyzedControlPoints: 0,
        failedControlPoints: totalPoints,
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
        results: [],
    }
}

function calculateSummary(totalPoints: number, results: ControlPointAnalysisResult[]): AccessibilitySummary {
    const successfulResults = results.filter((r) => r.analyzed)
    const failedResults = results.filter((r) => !r.analyzed)

    if (successfulResults.length === 0) {
        return {
            ...createEmptySummary(totalPoints),
            failedControlPoints: failedResults.length,
            results,
        }
    }

    const accessible5MinCount = successfulResults.filter((r) => r.isAccessible5Min).length
    const accessible10MinCount = successfulResults.filter((r) => r.isAccessible10Min).length

    const straightDistances = successfulResults.map((r) => r.straightDistanceMeters)
    const walkingDistances = successfulResults.map((r) => r.walkingDistanceMeters)
    const walkingTimes = successfulResults.map((r) => r.walkingDurationSeconds)
    // CF — лише з реальних маршрутів OSRM: direct (=1.0), fallback (1.4) і correction (1.25) є припущеннями
    const circuityFactors = successfulResults
        .filter((r) => r.routeSource === 'osrm')
        .map((r) => r.circuityFactor)

    const sourceCounts: Record<RouteSource, number> = { direct: 0, osrm: 0, fallback: 0, correction: 0 }
    for (const r of successfulResults) sourceCounts[r.routeSource]++

    const euclid5 = successfulResults.filter((r) => (r.euclideanNearestMeters ?? Infinity) <= EUCLID_COVERAGE_5_METERS)
    const euclid10 = successfulResults.filter((r) => (r.euclideanNearestMeters ?? Infinity) <= EUCLID_COVERAGE_10_METERS)
    const pct = (n: number) => Math.round((n / totalPoints) * 100)

    const safeAvg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length
    const safeRound = (n: number) => Math.round(n)

    return {
        totalControlPoints: totalPoints,
        analyzedControlPoints: successfulResults.length,
        failedControlPoints: failedResults.length,
        accessible5MinCount,
        accessible5MinPercent: Math.round((accessible5MinCount / totalPoints) * 100),
        accessible10MinCount,
        accessible10MinPercent: Math.round((accessible10MinCount / totalPoints) * 100),
        avgStraightDistanceMeters: safeRound(safeAvg(straightDistances)),
        medianStraightDistanceMeters: safeRound(median(straightDistances)),
        avgWalkingDistanceMeters: safeRound(safeAvg(walkingDistances)),
        medianWalkingDistanceMeters: safeRound(median(walkingDistances)),
        avgWalkingTimeMins: safeRound(safeAvg(walkingTimes) / 60),
        medianWalkingTimeMins: safeRound(median(walkingTimes) / 60),
        avgCircuityFactor: circuityFactors.length > 0 ? Number(safeAvg(circuityFactors).toFixed(2)) : 0,
        medianCircuityFactor: circuityFactors.length > 0 ? Number(median(circuityFactors).toFixed(2)) : 0,
        p90CircuityFactor: circuityFactors.length > 0 ? Number(percentile(circuityFactors, 90).toFixed(2)) : 0,
        maxCircuityFactor: circuityFactors.length > 0 ? Number(Math.max(...circuityFactors).toFixed(2)) : 0,
        circuitySampleSize: circuityFactors.length,
        timeModel: 'distance',
        sourceCounts,
        euclid5MinCount: euclid5.length,
        euclid5MinPercent: pct(euclid5.length),
        euclid10MinCount: euclid10.length,
        euclid10MinPercent: pct(euclid10.length),
        falseCovered5MinCount: euclid5.filter((r) => !r.isAccessible5Min).length,
        falseCovered10MinCount: euclid10.filter((r) => !r.isAccessible10Min).length,
        results
    }
}