import type { AccessibilitySummary } from './accessibility'
import type { ControlPoint } from '../data/controlPoints'
import type { CategoryImpact, OptimizationCandidate } from '../types/optimizationType'

export function compareOptimizationCandidates(
    a: OptimizationCandidate,
    b: OptimizationCandidate
): number {
    return (
        // Режим per-category: спершу нові точки в категоріях, що ще не досягли цілі
        (b.deltaPriorityCount5 ?? 0) - (a.deltaPriorityCount5 ?? 0) ||
        // Порівняння за кількістю точок: відсотки округлені (1 точка ≈ 1.6%), тож Δ у % «стрибає» між 1 і 2
        (b.deltaCount5 ?? b.deltaCoverage5) - (a.deltaCount5 ?? a.deltaCoverage5) ||
        (b.deltaCount10 ?? b.deltaCoverage10) - (a.deltaCount10 ?? a.deltaCoverage10) ||
        (b.deltaWalkingDistance ?? 0) - (a.deltaWalkingDistance ?? 0)
    )
}

/** Категорії, у яких частка точок ≤ 5 хв нижча за ціль (у відсотках). */
export function getDeficientCategories(
    summary: AccessibilitySummary,
    targetPercent: number
): Set<ControlPoint['category']> {
    const totals = new Map<ControlPoint['category'], { n: number; covered: number }>()
    for (const r of summary.results) {
        if (!r.analyzed) continue
        const t = totals.get(r.point.category) ?? { n: 0, covered: 0 }
        t.n++
        if (r.isAccessible5Min) t.covered++
        totals.set(r.point.category, t)
    }

    const out = new Set<ControlPoint['category']>()
    for (const [cat, t] of totals) {
        if ((t.covered / t.n) * 100 < targetPercent) out.add(cat)
    }
    return out
}

/** Покриття за категоріями до і після додавання обраних вбиралень (рахунок точок). */
export function computeCategoryImpact(before: AccessibilitySummary, after: AccessibilitySummary): CategoryImpact[] {
    const afterById = new Map(after.results.map((r) => [r.point.id, r]))
    const map = new Map<CategoryImpact['category'], CategoryImpact>()

    for (const b of before.results) {
        const a = afterById.get(b.point.id)
        if (!b.analyzed || !a?.analyzed) continue

        const cat = b.point.category
        if (!map.has(cat)) map.set(cat, { category: cat, n: 0, before5: 0, after5: 0, before10: 0, after10: 0 })
        const row = map.get(cat)!
        row.n++
        if (b.isAccessible5Min) row.before5++
        if (a.isAccessible5Min) row.after5++
        if (b.isAccessible10Min) row.before10++
        if (a.isAccessible10Min) row.after10++
    }

    return Array.from(map.values())
}

export function evaluateCandidate(
    latitude: number,
    longitude: number,
    baseline: AccessibilitySummary,
    result: AccessibilitySummary,
    priorityCategories?: ReadonlySet<ControlPoint['category']> | null,
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

    const baselineById = new Map(baseline.results.map((b) => [b.point.id, b]))
    const deltaPriorityCount5 = priorityCategories
        ? result.results.filter((r) => {
            const before = baselineById.get(r.point.id)
            return (
                priorityCategories.has(r.point.category) &&
                r.analyzed && r.isAccessible5Min &&
                before?.analyzed === true && !before.isAccessible5Min
            )
        }).length
        : undefined

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
        deltaWalkingDistance: baseline.avgWalkingDistanceMeters - result.avgWalkingDistanceMeters,
        deltaPriorityCount5,
        deltaCount5: result.accessible5MinCount - baseline.accessible5MinCount,
        deltaCount10: result.accessible10MinCount - baseline.accessible10MinCount,
        n: result.totalControlPoints,
    }
    return candidate
}

/**
 * Кандидати навколо дефіцитних точок: сама точка + кільця заданих радіусів по 8 напрямках.
 * Рівномірна сітка ~900 м часто не має вузла в межах 400 м від проблемної точки,
 * тому саме ці кандидати здатні реально дати покриття за 5 хв.
 */
export function generateDeficitCandidates(
    points: Array<{ latitude: number; longitude: number }>,
    radiiMeters: number[] = [120, 250],
    directions: number = 8
): Array<{ latitude: number; longitude: number }> {
    const out: Array<{ latitude: number; longitude: number }> = []
    const seen = new Set<string>()
    const push = (latitude: number, longitude: number) => {
        const lat = Number(latitude.toFixed(6))
        const lng = Number(longitude.toFixed(6))
        const key = `${lat},${lng}`
        if (seen.has(key)) return
        seen.add(key)
        out.push({ latitude: lat, longitude: lng })
    }

    for (const p of points) {
        push(p.latitude, p.longitude)
        const metersPerDegLat = 111320
        const metersPerDegLng = 111320 * Math.cos((p.latitude * Math.PI) / 180)
        for (const r of radiiMeters) {
            for (let k = 0; k < directions; k++) {
                const angle = (2 * Math.PI * k) / directions
                push(
                    p.latitude + (r * Math.sin(angle)) / metersPerDegLat,
                    p.longitude + (r * Math.cos(angle)) / metersPerDegLng
                )
            }
        }
    }

    return out
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
const SNAP_REQUEST_DELAY_MS = 120

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
        // Невелика пауза лише після реального HTTP-запиту — щоб не впиратись у ліміт публічного OSRM
        await new Promise((r) => setTimeout(r, SNAP_REQUEST_DELAY_MS))
        if (fetched === undefined) return { latitude, longitude }
        cached = fetched
        snapCache.set(key, cached)
        persistSnapCache()
    }

    if (!cached || cached.distance > maxDistanceMeters) return null
    return { latitude: cached.latitude, longitude: cached.longitude }
}
