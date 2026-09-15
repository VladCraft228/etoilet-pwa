import * as turf from '@turf/turf'
import type { Toilet } from '../../types'
import type { ControlPoint } from '../data/controlPoints'
import { getStraightDistance } from '../../components/utils/geo'

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
const REQUEST_DELAY_MS = 150
const FIVE_MINUTES_SECONDS = 5 * 60
const TEN_MINUTES_SECONDS = 10 * 60

// ==========================================================
// HELPERS
// ==========================================================

const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => {
        setTimeout(resolve, ms)
    })

function median(values: number[]): number {
    if (values.length === 0) return 0

    const sorted = [...values].sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)

    if (sorted.length % 2 === 0) {
        return (sorted[middle - 1] + sorted[middle]) / 2
    }

    return sorted[middle]
}

// ==========================================================
// OSRM & CACHE
// ==========================================================

const osrmCache = new Map<string, { distanceMeters: number; durationSeconds: number } | null>()

async function fetchOsrmNetworkRouteRaw(
    startLng: number,
    startLat: number,
    endLng: number,
    endLat: number
): Promise<{ distanceMeters: number; durationSeconds: number } | null> {
    try {
        const url = `${OSRM_BASE_URL}/${startLng},${startLat};${endLng},${endLat}?overview=false`
        const response = await fetch(url)

        if (!response.ok) {
            console.warn(`OSRM HTTP ${response.status}`)
            return null
        }

        const data = (await response.json()) as OsrmRouteResponse

        if (data.code !== 'Ok' || !data.routes?.length) {
            return null
        }

        const route = data.routes[0]

        return {
            distanceMeters: Math.round(route.distance),
            durationSeconds: Math.round(route.duration),
        }
    } catch (error) {
        console.warn('OSRM network request error:', error)
        return null
    }
}

export async function fetchOsrmNetworkRoute(
    startLng: number,
    startLat: number,
    endLng: number,
    endLat: number,
    useNetwork: boolean = true
): Promise<{ distanceMeters: number; durationSeconds: number } | null> {
    if (!useNetwork) {
        const dist = getStraightDistance(startLat, startLng, endLat, endLng)
        return {
            distanceMeters: Math.round(dist),
            durationSeconds: Math.round(dist / 1.38),
        }
    }

    const cacheKey = `${startLat.toFixed(5)},${startLng.toFixed(5)}->${endLat.toFixed(5)},${endLng.toFixed(5)}`

    if (osrmCache.has(cacheKey)) {
        return osrmCache.get(cacheKey)!
    }

    const result = await fetchOsrmNetworkRouteRaw(startLng, startLat, endLng, endLat)
    osrmCache.set(cacheKey, result)

    return result
}

// ==========================================================
// MAIN ANALYSIS
// ==========================================================

export async function evaluateControlPointsAccessibilityNetwork(
    controlPoints: ControlPoint[],
    toilets: Toilet[],
    options: AccessibilityOptions = {}
): Promise<AccessibilitySummary> {
    const maxCandidates = Math.max(
        1,
        Math.floor(options.maxCandidates ?? DEFAULT_MAX_CANDIDATES)
    )

    const validToilets = toilets.filter(
        (toilet) => toilet.latitude != null && toilet.longitude != null
    )

    if (validToilets.length === 0 || controlPoints.length === 0) {
        return {
            totalControlPoints: controlPoints.length,
            analyzedControlPoints: 0,
            failedControlPoints: controlPoints.length,
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

    const results: ControlPointAnalysisResult[] = []

    for (const controlPoint of controlPoints) {
        const controlPointFeature = turf.point([controlPoint.longitude, controlPoint.latitude])

        const sortedCandidates = validToilets
            .map((toilet) => {
                const toiletFeature = turf.point([toilet.longitude!, toilet.latitude!])
                const distance = turf.distance(controlPointFeature, toiletFeature, { units: 'meters' })

                return {
                    toilet,
                    straightMeters: Math.round(distance),
                }
            })
            .sort((a, b) => a.straightMeters - b.straightMeters)

        const candidates = sortedCandidates.slice(0, maxCandidates)

        const networkResults: Array<{
            candidate: (typeof candidates)[number]
            route: { distanceMeters: number; durationSeconds: number }
        }> = []

        for (const candidate of candidates) {
            const route = await fetchOsrmNetworkRoute(
                controlPoint.longitude,
                controlPoint.latitude,
                candidate.toilet.longitude!,
                candidate.toilet.latitude!,
                true
            )

            if (route) {
                networkResults.push({ candidate, route })
            }

            await sleep(REQUEST_DELAY_MS)
        }

        if (networkResults.length === 0) {
            results.push({
                point: controlPoint,
                nearestToilet: candidates[0]?.toilet ?? null,
                straightDistanceMeters: candidates[0]?.straightMeters ?? 0,
                walkingDistanceMeters: 0,
                walkingDurationSeconds: 0,
                circuityFactor: 0,
                isAccessible5Min: false,
                isAccessible10Min: false,
                analyzed: false,
            })

            continue
        }

        const bestResult = networkResults.reduce((best, current) => {
            return current.route.distanceMeters < best.route.distanceMeters ? current : best
        })

        const straightDistance = bestResult.candidate.straightMeters
        const walkingDistance = bestResult.route.distanceMeters
        const walkingDuration = bestResult.route.durationSeconds
        const circuityFactor =
            straightDistance > 0 ? Number((walkingDistance / straightDistance).toFixed(2)) : 1

        results.push({
            point: controlPoint,
            nearestToilet: bestResult.candidate.toilet,
            straightDistanceMeters: straightDistance,
            walkingDistanceMeters: walkingDistance,
            walkingDurationSeconds: walkingDuration,
            circuityFactor,
            isAccessible5Min: walkingDuration <= FIVE_MINUTES_SECONDS,
            isAccessible10Min: walkingDuration <= TEN_MINUTES_SECONDS,
            analyzed: true,
        })
    }

    // AGGREGATION
    const successfulResults = results.filter((r) => r.analyzed)
    const failedResults = results.filter((r) => !r.analyzed)

    if (successfulResults.length === 0) {
        return {
            totalControlPoints: controlPoints.length,
            analyzedControlPoints: 0,
            failedControlPoints: failedResults.length,
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
            results,
        }
    }

    const accessible5MinCount = successfulResults.filter((r) => r.isAccessible5Min).length
    const accessible10MinCount = successfulResults.filter((r) => r.isAccessible10Min).length

    const straightDistances = successfulResults.map((r) => r.straightDistanceMeters)
    const walkingDistances = successfulResults.map((r) => r.walkingDistanceMeters)
    const walkingTimes = successfulResults.map((r) => r.walkingDurationSeconds)
    const circuityFactors = successfulResults.map((r) => r.circuityFactor)

    const sumStraight = straightDistances.reduce((acc, val) => acc + val, 0)
    const sumWalking = walkingDistances.reduce((acc, val) => acc + val, 0)
    const sumWalkingTime = walkingTimes.reduce((acc, val) => acc + val, 0)
    const sumCircuity = circuityFactors.reduce((acc, val) => acc + val, 0)

    return {
        totalControlPoints: controlPoints.length,
        analyzedControlPoints: successfulResults.length,
        failedControlPoints: failedResults.length,
        accessible5MinCount,
        accessible5MinPercent: Math.round((accessible5MinCount / successfulResults.length) * 100),
        accessible10MinCount,
        accessible10MinPercent: Math.round((accessible10MinCount / successfulResults.length) * 100),
        avgStraightDistanceMeters: Math.round(sumStraight / successfulResults.length),
        medianStraightDistanceMeters: Math.round(median(straightDistances)),
        avgWalkingDistanceMeters: Math.round(sumWalking / successfulResults.length),
        medianWalkingDistanceMeters: Math.round(median(walkingDistances)),
        avgWalkingTimeMins: Math.round(sumWalkingTime / successfulResults.length / 60),
        medianWalkingTimeMins: Math.round(median(walkingTimes) / 60),
        avgCircuityFactor: Number((sumCircuity / successfulResults.length).toFixed(2)),
        medianCircuityFactor: Number(median(circuityFactors).toFixed(2)),
        results,
    }
}

// ==========================================================
// EXPORT CSV
// ==========================================================

export function exportAccessibilityResultsCsv(
    summary: AccessibilitySummary,
    maxCandidates: number = 3
) {
    let csv = '\uFEFF'

    csv +=
        'ID;Назва;Категорія;Широта;Довгота;' +
        'Найближча вбиральня;' +
        'Евклідова відстань, м;' +
        'Пішохідна відстань, м;' +
        'Пішохідний час, с;' +
        'Пішохідний час, хв;' +
        'Circuity Factor;' +
        'Доступність 5 хв;' +
        'Доступність 10 хв;' +
        'Проаналізовано\n'

    for (const result of summary.results) {
        const point = result.point
        const toiletName = result.nearestToilet?.address ?? result.nearestToilet?.id ?? ''
        const walkingTimeMin = Number((result.walkingDurationSeconds / 60).toFixed(1))

        csv +=
            [
                point.id,
                `"${point.name.replace(/"/g, '""')}"`,
                point.category,
                point.latitude,
                point.longitude,
                `"${String(toiletName).replace(/"/g, '""')}"`,
                result.straightDistanceMeters,
                result.walkingDistanceMeters,
                result.walkingDurationSeconds,
                walkingTimeMin,
                result.circuityFactor,
                result.isAccessible5Min ? 'Так' : 'Ні',
                result.isAccessible10Min ? 'Так' : 'Ні',
                result.analyzed ? 'Так' : 'Ні',
            ].join(';') + '\n'
    }

    csv += '\n'
    csv += `MAX_CANDIDATES;${maxCandidates}\n`
    csv += `Всього контрольних точок;${summary.totalControlPoints}\n`
    csv += `Проаналізовано;${summary.analyzedControlPoints}\n`
    csv += `Помилки маршрутизації;${summary.failedControlPoints}\n`
    csv += `Покриття 5 хв;${summary.accessible5MinPercent}%\n`
    csv += `Покриття 10 хв;${summary.accessible10MinPercent}%\n`
    csv += `Середня мережева відстань;${summary.avgWalkingDistanceMeters} м\n`
    csv += `Медіанна мережева відстань;${summary.medianWalkingDistanceMeters} м\n`
    csv += `Середній час;${summary.avgWalkingTimeMins} хв\n`
    csv += `Медіанний час;${summary.medianWalkingTimeMins} хв\n`
    csv += `Середній Circuity;${summary.avgCircuityFactor}\n`
    csv += `Медіанний Circuity;${summary.medianCircuityFactor}\n`

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `accessibility_baseline_${maxCandidates}_candidates.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
}