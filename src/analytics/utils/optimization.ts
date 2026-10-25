import * as turf from '@turf/turf'
import type { AccessibilitySummary } from './accessibility'
import type { OptimizationCandidate } from '../types/optimizationType'

export function computeCandidateScore(candidate: Pick<OptimizationCandidate, 'deltaCoverage5' | 'deltaCoverage10' | 'avgWalkingDistance' | 'improvedPoints' | 'avgCircuity'>): number {
    return (
        candidate.deltaCoverage5 * 1.6 +
        candidate.deltaCoverage10 * 1.2 +
        candidate.improvedPoints * 0.8 -
        candidate.avgWalkingDistance * 0.01 -
        Math.max(0, candidate.avgCircuity - 1.5) * 4
    )
}

export function greedySelectDistinctCandidates(
    candidates: OptimizationCandidate[],
    minSeparationMeters: number = 300
): OptimizationCandidate[] {
    const ranked = [...candidates].sort((a, b) => computeCandidateScore(b) - computeCandidateScore(a))
    const selected: OptimizationCandidate[] = []

    for (const candidate of ranked) {
        const overlaps = selected.some((existing) => {
            const dist = turf.distance(
                turf.point([existing.longitude, existing.latitude]),
                turf.point([candidate.longitude, candidate.latitude]),
                { units: 'meters' }
            )
            return dist < minSeparationMeters
        })

        if (!overlaps) selected.push(candidate)
    }

    return selected
}

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

    const candidate: OptimizationCandidate = {
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
        score: 0,
        n: result.totalControlPoints,
    }

    candidate.score = computeCandidateScore(candidate)
    return candidate
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

// ==========================================================
// ПРИВ'ЯЗКА КАНДИДАТІВ ДО ПІШОХІДНОЇ МЕРЕЖІ (відсікання води)
// ==========================================================

const OSRM_NEAREST_URL = 'https://routing.openstreetmap.de/routed-foot/nearest/v1/driving'
const SNAP_CACHE_KEY = 'etoilet_osrm_snap_cache_v1'

/** Макс. відстань від вузла сітки до пішохідної мережі, інакше вважаємо його водою/недоступним. */
export const MAX_SNAP_DISTANCE_METERS = 40
/** Мін. відстань кандидата до вже наявної вбиральні. */
export const MIN_DISTANCE_TO_EXISTING_METERS = 150

export interface SnappedCandidate {
    latitude: number
    longitude: number
}

type SnapCacheValue = (SnappedCandidate & { distance: number }) | null

function loadSnapCache(): Map<string, SnapCacheValue> {
    try {
        const raw = localStorage.getItem(SNAP_CACHE_KEY)
        if (raw) return new Map(JSON.parse(raw) as Array<[string, SnapCacheValue]>)
    } catch (e) {
        console.warn('[Snap Cache] Не вдалося зчитати кеш:', e)
    }
    return new Map()
}

const snapCache = loadSnapCache()

function persistSnapCache(): void {
    try {
        localStorage.setItem(SNAP_CACHE_KEY, JSON.stringify(Array.from(snapCache.entries()).slice(-2000)))
    } catch (e) {
        console.warn('[Snap Cache] Не вдалося зберегти кеш:', e)
    }
}

async function fetchNearestRaw(
    latitude: number,
    longitude: number,
    retries = 3
): Promise<SnapCacheValue | undefined> {
    try {
        const response = await fetch(`${OSRM_NEAREST_URL}/${longitude},${latitude}?number=1`)

        if (!response.ok) {
            if (response.status === 429 && retries > 0) {
                await new Promise((r) => setTimeout(r, 3000))
                return fetchNearestRaw(latitude, longitude, retries - 1)
            }
            return undefined // тимчасова помилка — не кешуємо
        }

        const data = (await response.json()) as {
            code: string
            waypoints?: Array<{ location: [number, number]; distance: number }>
        }
        const wp = data.waypoints?.[0]
        if (data.code !== 'Ok' || !wp) return null

        return {
            latitude: Number(wp.location[1].toFixed(6)),
            longitude: Number(wp.location[0].toFixed(6)),
            distance: wp.distance,
        }
    } catch {
        if (retries > 0) {
            await new Promise((r) => setTimeout(r, 2500))
            return fetchNearestRaw(latitude, longitude, retries - 1)
        }
        return undefined
    }
}

/**
 * Прив'язує точку до найближчої пішохідної дороги через OSRM /nearest.
 * Повертає null, якщо точка далі за MAX_SNAP_DISTANCE_METERS (річка, острів без стежок тощо).
 * Якщо OSRM тимчасово недоступний — повертає вихідну точку (щоб не губити кандидатів).
 */
export async function snapToWalkableNetwork(
    latitude: number,
    longitude: number,
    maxDistanceMeters: number = MAX_SNAP_DISTANCE_METERS
): Promise<SnappedCandidate | null> {
    const key = `${latitude.toFixed(5)},${longitude.toFixed(5)}`

    let cached = snapCache.get(key)
    if (cached === undefined) {
        const fetched = await fetchNearestRaw(latitude, longitude)
        if (fetched === undefined) return { latitude, longitude }
        cached = fetched
        snapCache.set(key, cached)
        persistSnapCache()
    }

    if (!cached || cached.distance > maxDistanceMeters) return null
    return { latitude: cached.latitude, longitude: cached.longitude }
}
