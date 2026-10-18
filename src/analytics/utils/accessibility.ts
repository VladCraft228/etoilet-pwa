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

            // 🎯 1. ПІДСТРАХОВКА ПРЯМОЇ ВИДИМОСТІ (Straight-line Fallback)
            // Для великих площ, набережних і парків (до 180м) вважаємо об'єкт доступним без OSRM-обходів
            if (straightDistance <= STRAIGHT_LINE_THRESHOLD_METERS) {
                const walkingDuration = Math.round(straightDistance / WALKING_SPEED_MPS)
                result = {
                    point: cp,
                    nearestToilet: nearestCandidate.toilet,
                    straightDistanceMeters: straightDistance,
                    walkingDistanceMeters: straightDistance,
                    walkingDurationSeconds: walkingDuration,
                    circuityFactor: 1.0, // Ідеальний прямий шлях
                    isAccessible5Min: true,
                    isAccessible10Min: true,
                    analyzed: true,
                }
            } else {
                // 2. Звичайний OSRM розрахунок по графу для віддалених об'єктів
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

                    // 🎯 3. ФІЛЬТР АНОМАЛЬНИХ ГАКІВ OSRM (Graph Gap Detection)
                    // Якщо OSRM будує маршрут з CF > 2.0 (понад +100% обходу), але пряма відстань <= 250м,
                    // це топологічний розрив стежки в OSM (наприклад, причал або паркова зона).
                    if (circuityFactor > 2.0 && straightDistance <= 250) {
                        // Застосовуємо реалістичний коефіцієнт пішохідного обходу в рекреаційній зоні (1.25)
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
        results,
    }
}

// ==========================================================
// EXPORT FUNCTIONS
// ==========================================================

export function exportAccessibilityResultsCsv(
    summary: AccessibilitySummary,
    maxCandidates: number = 3
) {
    let csv = '\uFEFF'

    csv += [
        'ID', 'Назва', 'Категорія', 'Широта', 'Довгота',
        'Найближча вбиральня', 'Евклідова відстань (м)',
        'Пішохідна відстань (м)', 'Час (с)', 'Час (хв)',
        'Circuity Factor', 'Доступно 5 хв', 'Доступно 10 хв', 'Статус'
    ].join(';') + '\n'

    for (const result of summary.results) {
        const point = result.point
        const toiletName = result.nearestToilet?.address ?? result.nearestToilet?.id ?? 'N/A'
        const walkingTimeMin = (result.walkingDurationSeconds / 60).toFixed(1)

        const safeName = `"${point.name.replace(/"/g, '""')}"`
        const safeToilet = `"${String(toiletName).replace(/"/g, '""')}"`

        csv += [
            point.id,
            safeName,
            point.category,
            point.latitude,
            point.longitude,
            safeToilet,
            result.straightDistanceMeters,
            result.walkingDistanceMeters,
            result.walkingDurationSeconds,
            walkingTimeMin,
            result.circuityFactor,
            result.isAccessible5Min ? 'Так' : 'Ні',
            result.isAccessible10Min ? 'Так' : 'Ні',
            result.analyzed ? 'OK' : 'FAIL'
        ].join(';') + '\n'
    }

    csv += '\n'
    csv += `ПАРАМЕТРИ АНАЛІЗУ;\n`
    csv += `MAX_CANDIDATES;${maxCandidates}\n`
    csv += `Всього точок;${summary.totalControlPoints}\n`
    csv += `Успішно проаналізовано;${summary.analyzedControlPoints}\n`
    csv += `Помилки;${summary.failedControlPoints}\n`
    csv += `Покриття 5 хв;${summary.accessible5MinPercent}%\n`
    csv += `Покриття 10 хв;${summary.accessible10MinPercent}%\n`
    csv += `Середній час ходу;${summary.avgWalkingTimeMins} хв\n`
    csv += `Медіанний час ходу;${summary.medianWalkingTimeMins} хв\n`

    downloadFile(csv, `accessibility_report_${new Date().toISOString().slice(0,10)}.csv`, 'text/csv;charset=utf-8;')
}

export function exportAccessibilityReportHtml(
    summary: AccessibilitySummary,
    maxCandidates: number = 3
) {
    const dateStr = new Date().toLocaleDateString('uk-UA')

    const generateRows = () => {
        return summary.results.map(r => {
            let statusBgClass = 'bg-gray-100 text-gray-800'
            let statusText = 'N/A'

            if (!r.analyzed) {
                statusBgClass = 'bg-red-100 text-red-800 border border-red-200'
                statusText = 'Помилка'
            } else if (r.isAccessible5Min) {
                statusBgClass = 'bg-green-100 text-green-800 border border-green-200'
                statusText = 'Так (< 5 хв)'
            } else if (r.isAccessible10Min) {
                statusBgClass = 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                statusText = 'Так (< 10 хв)'
            } else {
                statusBgClass = 'bg-orange-100 text-orange-800 border border-orange-200'
                statusText = 'Ні (> 10 хв)'
            }

            return `
            <tr class="hover:bg-gray-50 transition-colors duration-150">
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${r.point.id}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700 max-w-xs truncate" title="${r.point.name}">${r.point.name}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 max-w-xs truncate" title="${r.nearestToilet?.address || ''}">${r.nearestToilet?.address || '—'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-right font-mono">${r.straightDistanceMeters}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold text-right font-mono">${r.walkingDistanceMeters}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-mono">${(r.walkingDurationSeconds / 60).toFixed(1)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-right font-mono">${r.circuityFactor}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusBgClass}">
                        ${statusText}
                    </span>
                </td>
            </tr>`;
        }).join('');
    };

    const successRate = summary.totalControlPoints > 0
        ? Math.round((summary.analyzedControlPoints / summary.totalControlPoints) * 100)
        : 0;

    const html = `
    <!DOCTYPE html>
    <html lang="uk">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Звіт доступності вбиральнь</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
            @media print {
                body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .no-print { display: none; }
            }
        </style>
    </head>
    <body class="bg-slate-50 text-slate-800 font-sans antialiased">
        <div class="max-w-7xl mx-auto p-6 sm:p-10">
            <header class="mb-10 border-b border-slate-200 pb-6">
                <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 class="text-3xl font-bold text-slate-900 tracking-tight">🚽 Аналіз доступності міських вбиральнь</h1>
                        <p class="text-slate-500 mt-2">Звіт сформовано: <span class="font-medium text-slate-700">${dateStr}</span></p>
                    </div>
                    <div class="flex items-center gap-3 no-print">
                        <button onclick="window.print()" class="inline-flex items-center px-4 py-2 bg-white border border-slate-300 rounded-md shadow-sm text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                            🖨️ Друк / PDF
                        </button>
                    </div>
                </div>
            </header>

            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
                <div class="bg-white overflow-hidden shadow rounded-lg border-l-4 border-indigo-500">
                    <div class="px-4 py-5 sm:p-6">
                        <dt class="text-sm font-medium text-slate-500 truncate uppercase tracking-wide">Покриття 5 хв</dt>
                        <dd class="mt-1 text-3xl font-semibold text-indigo-600">${summary.accessible5MinPercent}%</dd>
                        <p class="mt-2 text-sm text-slate-400">${summary.accessible5MinCount} з ${summary.totalControlPoints} точок</p>
                    </div>
                </div>

                <div class="bg-white overflow-hidden shadow rounded-lg border-l-4 border-emerald-500">
                    <div class="px-4 py-5 sm:p-6">
                        <dt class="text-sm font-medium text-slate-500 truncate uppercase tracking-wide">Середній час ходу</dt>
                        <dd class="mt-1 text-3xl font-semibold text-emerald-600">${summary.avgWalkingTimeMins} хв</dd>
                        <p class="mt-2 text-sm text-slate-400">Медіана: ${summary.medianWalkingTimeMins} хв</p>
                    </div>
                </div>

                <div class="bg-white overflow-hidden shadow rounded-lg border-l-4 border-blue-500">
                    <div class="px-4 py-5 sm:p-6">
                        <dt class="text-sm font-medium text-slate-500 truncate uppercase tracking-wide">Успішність розрахунку</dt>
                        <dd class="mt-1 text-3xl font-semibold text-blue-600">${successRate}%</dd>
                        <div class="w-full bg-slate-200 rounded-full h-1.5 mt-3">
                            <div class="bg-blue-500 h-1.5 rounded-full" style="width: ${successRate}%"></div>
                        </div>
                        <p class="mt-2 text-xs text-slate-400 text-right">${summary.failedControlPoints} помилок</p>
                    </div>
                </div>

                <div class="bg-white overflow-hidden shadow rounded-lg border-l-4 border-amber-500">
                    <div class="px-4 py-5 sm:p-6">
                        <dt class="text-sm font-medium text-slate-500 truncate uppercase tracking-wide">Circuity Factor</dt>
                        <dd class="mt-1 text-3xl font-semibold text-amber-600">${summary.avgCircuityFactor}</dd>
                        <p class="mt-2 text-sm text-slate-400">Середнє відхилення маршруту</p>
                    </div>
                </div>
            </div>

            <div class="bg-white shadow-lg rounded-lg overflow-hidden border border-slate-200">
                <div class="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                    <h2 class="text-lg font-medium text-slate-800">Детальні результати по контрольних точках</h2>
                    <span class="text-xs font-medium px-2 py-1 bg-slate-200 text-slate-600 rounded">Кандидатів: ${maxCandidates}</span>
                </div>
                
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-slate-200">
                        <thead class="bg-slate-100">
                            <tr>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">ID</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Локація</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Найближча вбиральня</th>
                                <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Пряма (м)</th>
                                <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Маршрут (м)</th>
                                <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Час (хв)</th>
                                <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">CF</th>
                                <th scope="col" class="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Статус (5 хв)</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-slate-200">
                            ${generateRows()}
                        </tbody>
                    </table>
                </div>
                
                ${summary.results.length === 0 ? '<div class="p-10 text-center text-slate-500">Немає даних для відображення</div>' : ''}
            </div>

            <footer class="mt-10 pt-6 border-t border-slate-200 text-sm text-slate-500">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                        <h3 class="font-semibold text-slate-700 mb-2">Легенда:</h3>
                        <ul class="space-y-2">
                            <li class="flex items-center"><span class="w-3 h-3 rounded-full bg-green-100 border border-green-200 mr-2"></span> Доступно пішки ≤ 5 хв</li>
                            <li class="flex items-center"><span class="w-3 h-3 rounded-full bg-yellow-100 border border-yellow-200 mr-2"></span> Доступно пішки ≤ 10 хв</li>
                            <li class="flex items-center"><span class="w-3 h-3 rounded-full bg-orange-100 border border-orange-200 mr-2"></span> Більше 10 хв ходьби</li>
                            <li class="flex items-center"><span class="w-3 h-3 rounded-full bg-red-100 border border-red-200 mr-2"></span> Помилка маршрутизації</li>
                        </ul>
                    </div>
                    <div>
                        <h3 class="font-semibold text-slate-700 mb-2">Примітки:</h3>
                        <p class="mb-2"><strong>CF (Circuity Factor):</strong> Відношення довжини пішохідного маршруту до прямої відстані. Чим ближче до 1.0, тим пряміший шлях.</p>
                        <p>Маршрутизація виконана через OSRM (профіль пішохода).</p>
                        <p class="mt-2 text-xs italic">* Для точок у межах прямої видимості (≤ 80 м) чи де OSRM не зміг прокласти маршрут (парки, набережні), використано евклідову відстань.</p>
                    </div>
                </div>
            </footer>
        </div>
    </body>
    </html>`;

    downloadFile(html, `accessibility_report_${new Date().toISOString().slice(0,10)}.html`, 'text/html;charset=utf-8;')
}

function downloadFile(content: string, filename: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()

    setTimeout(() => {
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
    }, 100)
}