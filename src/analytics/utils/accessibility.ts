import type { Toilet } from '../../types'
import type { ControlPoint } from '../data/controlPoints'
import { getStraightDistance } from '../../components/utils/geo'
import { median } from './spatialStats.ts'

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

export interface AccessibilityOptions {
    maxCandidates?: number
    concurrencyLimit?: number
    bufferRadiusKm?: number
    maxRadiusMeters?: number
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
    delayMs: number,
    processor: (item: T) => Promise<R>
): Promise<R[]> {
    const results: R[] = []

    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize)
        const batchResults = await Promise.all(batch.map(processor))
        results.push(...batchResults)

        if (i + batchSize < items.length) {
            await new Promise(resolve => setTimeout(resolve, delayMs))
        }
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

    const processPoint = async ({ cp, candidates }: typeof controlPointsWithCandidates[0]): Promise<ControlPointAnalysisResult> => {
        let result: ControlPointAnalysisResult

        if (candidates.length === 0) {
            result = {
                point: cp,
                nearestToilet: null,
                straightDistanceMeters: 0,
                walkingDistanceMeters: 0,
                walkingDurationSeconds: 0,
                circuityFactor: 0,
                isAccessible5Min: false,
                isAccessible10Min: false,
                analyzed: false,
            }
        } else {
            const nearestCandidate = candidates[0]
            const straightDistance = Math.round(nearestCandidate.dist)

            if (straightDistance <= STRAIGHT_LINE_THRESHOLD_METERS) {
                const walkingDuration = Math.round(straightDistance / WALKING_SPEED_MPS)
                result = {
                    point: cp,
                    nearestToilet: nearestCandidate.toilet,
                    straightDistanceMeters: straightDistance,
                    walkingDistanceMeters: straightDistance,
                    walkingDurationSeconds: walkingDuration,
                    circuityFactor: 1.0,
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
                    const fallbackDistance = Math.round(straightDistance * FALLBACK_CIRCUITY_FACTOR)
                    const fallbackDuration = Math.round(fallbackDistance / WALKING_SPEED_MPS)

                    result = {
                        point: cp,
                        nearestToilet: nearestCandidate.toilet,
                        straightDistanceMeters: straightDistance,
                        walkingDistanceMeters: fallbackDistance,
                        walkingDurationSeconds: fallbackDuration,
                        circuityFactor: FALLBACK_CIRCUITY_FACTOR,
                        isAccessible5Min: fallbackDuration <= FIVE_MINUTES_SECONDS,
                        isAccessible10Min: fallbackDuration <= TEN_MINUTES_SECONDS,
                        analyzed: true,
                    }
                } else {
                    let walkingDistance = bestResult.route.distanceMeters
                    let walkingDuration = bestResult.route.durationSeconds
                    let circuityFactor = straightDistance > 0
                        ? Number((walkingDistance / straightDistance).toFixed(2))
                        : 1

                    if (walkingDistance > straightDistance * 3 || walkingDistance > 1000) {
                        walkingDistance = Math.round(straightDistance * 1.3)
                        walkingDuration = Math.round(walkingDistance / WALKING_SPEED_MPS)
                        circuityFactor = 1.3
                    }

                    if (circuityFactor > 2.0 && straightDistance <= 250) {
                        const correctedDistance = Math.round(straightDistance * 1.25)
                        const correctedDuration = Math.round(correctedDistance / WALKING_SPEED_MPS)

                        result = {
                            point: cp,
                            nearestToilet: bestResult.candidate.toilet,
                            straightDistanceMeters: straightDistance,
                            walkingDistanceMeters: correctedDistance,
                            walkingDurationSeconds: correctedDuration,
                            circuityFactor: 1.25,
                            isAccessible5Min: correctedDuration <= FIVE_MINUTES_SECONDS,
                            isAccessible10Min: correctedDuration <= TEN_MINUTES_SECONDS,
                            analyzed: true,
                        }
                    } else {
                        result = {
                            point: cp,
                            nearestToilet: bestResult.candidate.toilet,
                            straightDistanceMeters: straightDistance,
                            walkingDistanceMeters: walkingDistance,
                            walkingDurationSeconds: walkingDuration,
                            circuityFactor,
                            isAccessible5Min: walkingDuration <= FIVE_MINUTES_SECONDS,
                            isAccessible10Min: walkingDuration <= TEN_MINUTES_SECONDS,
                            analyzed: true,
                        }
                    }
                }
            }
        }

        completedCount++
        onProgress?.(completedCount, controlPoints.length, `Аналіз точки: ${cp.name}`)
        return result
    }

    const results = await processInBatches(
        controlPointsWithCandidates,
        concurrencyLimit,
        REQUEST_DELAY_MS,
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
    const circuityFactors = successfulResults.map((r) => r.circuityFactor)

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
        avgCircuityFactor: Number(safeAvg(circuityFactors).toFixed(2)),
        medianCircuityFactor: Number(median(circuityFactors).toFixed(2)),
        results
    }
}