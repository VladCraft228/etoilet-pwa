import * as turf from '@turf/turf'
import type { Toilet } from '../../types'

export interface GisSummaryStats {
    totalToilets: number
    bufferRadiusKm: number
    avgNearestNeighborDistanceMeters: number
    medianNearestDistanceMeters?: number
    minNearestDistanceMeters: number
    maxNearestDistanceMeters: number
}

// Константи для fallback назв
const FALLBACK_NAMES = {
    bio: 'Біотуалет',
    public: 'Громадська вбиральня'
} as const

/**
 * Отримує назву вбиральні з fallback логікою
 */
function getToiletName(toilet: Toilet, index: number): string {
    const baseName = toilet.type === 'bio'
        ? FALLBACK_NAMES.bio
        : FALLBACK_NAMES.public
    return toilet.address || `${baseName} #${index + 1}`
}

/**
 * Розраховує середнє арифметичне значення масиву чисел
 */
export function average(values: number[]): number {
    if (values.length === 0) return 0

    // Фільтруємо нескінченні та нечислові значення
    const finiteValues = values.filter(v => typeof v === 'number' && isFinite(v))
    if (finiteValues.length === 0) return 0

    return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length
}

/**
 * Розраховує медіану масиву чисел
 */
export function median(values: number[]): number {
    if (values.length === 0) return 0

    const sorted = [...values].sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)

    if (sorted.length % 2 === 0) {
        return (sorted[middle - 1] + sorted[middle]) / 2
    }

    return sorted[middle]
}

/**
 * Обчислює відстані до найближчих сусідів для всіх точок
 */
function calculateNearestDistances(toilets: Toilet[]): Map<number | string, number> {
    const distancesMap = new Map<number | string, number>()

    if (toilets.length < 2) {
        return distancesMap
    }

    const points = toilets.map((t, index) =>
        turf.point([t.longitude!, t.latitude!], { id: t.id ?? index })
    )

    for (let i = 0; i < points.length; i++) {
        const currentPoint = points[i]
        const otherPoints = turf.featureCollection(
            points.filter((_, idx) => idx !== i)
        )

        const nearest = turf.nearestPoint(currentPoint, otherPoints)
        const distMeters = Math.round(turf.distance(currentPoint, nearest, { units: 'meters' }))

        const toiletId = toilets[i].id ?? i
        distancesMap.set(toiletId, distMeters)
    }

    return distancesMap
}

/**
 * Універсальна функція завантаження CSV файлу
 */
function downloadCsv(content: string, filename: string) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', filename)
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()

    // Очищення ресурсів
    setTimeout(() => {
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
    }, 100)
}

/**
 * Розраховує просторову щільність та відстані до найближчих сусідів між вбиральнями
 */
export function calculateGisStats(
    toilets: Toilet[],
    bufferRadiusKm: number
): GisSummaryStats {
    // Валідація вхідних даних
    if (!Array.isArray(toilets)) {
        throw new Error('toilets must be an array')
    }
    if (bufferRadiusKm <= 0 || !isFinite(bufferRadiusKm)) {
        throw new Error('bufferRadiusKm must be a positive finite number')
    }

    const validToilets = toilets.filter(
        (t) => t.latitude != null && t.longitude != null
    )

    if (validToilets.length < 2) {
        return {
            totalToilets: validToilets.length,
            bufferRadiusKm,
            avgNearestNeighborDistanceMeters: 0,
            medianNearestDistanceMeters: 0,
            minNearestDistanceMeters: 0,
            maxNearestDistanceMeters: 0
        }
    }

    const points = validToilets.map((t, index) =>
        turf.point([t.longitude!, t.latitude!], { id: t.id ?? index })
    )

    const nearestDistances: number[] = []

    // Для кожної точки знаходимо найближчого сусіда
    for (let i = 0; i < points.length; i++) {
        const currentPoint = points[i]
        const otherPoints = turf.featureCollection(
            points.filter((_, idx) => idx !== i)
        )

        const nearest = turf.nearestPoint(currentPoint, otherPoints)
        const distMeters = turf.distance(currentPoint, nearest, { units: 'meters' })
        nearestDistances.push(distMeters)
    }

    const avg = average(nearestDistances)
    const med = median(nearestDistances)
    const min = Math.min(...nearestDistances)
    const max = Math.max(...nearestDistances)

    return {
        totalToilets: validToilets.length,
        bufferRadiusKm,
        avgNearestNeighborDistanceMeters: Math.round(avg),
        medianNearestDistanceMeters: Math.round(med),
        minNearestDistanceMeters: Math.round(min),
        maxNearestDistanceMeters: Math.round(max)
    }
}

/**
 * Генерація та завантаження CSV-файлу зі статистикою для таблиць у дипломі
 */
export function exportGisReportCsv(
    toilets: Toilet[],
    stats: GisSummaryStats
) {
    const validToilets = toilets.filter(
        (t) => t.latitude != null && t.longitude != null
    )

    if (validToilets.length === 0) {
        console.warn('No valid toilets to export')
        return
    }

    // Попередньо обчисліть відстані один раз (оптимізація)
    const distancesMap = calculateNearestDistances(validToilets)

    // 1. Метадані аналізу
    let csvContent = '\uFEFF' // UTF-8 BOM для коректного відкриття в Excel
    csvContent += 'ЗВІТ ГІС-АНАЛІТИКИ ДОСТУПНОСТІ МІСЬКИХ ВБИРАЛЬНЬ\n'
    csvContent += `Дата формування;${new Date().toLocaleDateString('uk-UA')}\n`
    csvContent += `Обраний радіус пішої доступності;${stats.bufferRadiusKm * 1000} м (${stats.bufferRadiusKm} км)\n`
    csvContent += `Загальна кількість об'єктів;${stats.totalToilets}\n`
    csvContent += `Середня відстань до найближчого сусіда;${stats.avgNearestNeighborDistanceMeters} м\n`

    if (stats.medianNearestDistanceMeters !== undefined) {
        csvContent += `Медіана відстані до найближчого сусіда;${stats.medianNearestDistanceMeters} м\n`
    }

    csvContent += `Мінімальна відстань між об'єктами;${stats.minNearestDistanceMeters} м\n`
    csvContent += `Максимальна відстань між об'єктами;${stats.maxNearestDistanceMeters} м\n\n`

    // 2. Таблиця точок із їхніми координатами та найближчими сусідами
    csvContent += 'ID;Адреса / Тип;Широта (Latitude);Довгота (Longitude);Відстань до найближчої вбиральні (м)\n'

    validToilets.forEach((toilet, idx) => {
        const name = getToiletName(toilet, idx).replace(/;/g, ',')
        const distance = distancesMap.get(toilet.id ?? idx) ?? 0

        csvContent += `${toilet.id ?? idx + 1};"${name}";${toilet.latitude};${toilet.longitude};${distance}\n`
    })

    // 3. Завантаження файлу браузером
    const filename = `gis_analytics_report_${stats.bufferRadiusKm * 1000}m.csv`
    downloadCsv(csvContent, filename)
}

export function exportGisReportHtml(
    toilets: Toilet[],
    stats: GisSummaryStats
) {
    const validToilets = toilets.filter((t) => t.latitude != null && t.longitude != null)
    const dateStr = new Date().toLocaleDateString('uk-UA')

    // Генеруємо рядки таблиці
    const generateRows = () => {
        return validToilets.map((t, idx) => {
            const fallbackName = t.type === 'bio' ? `Біотуалет #${idx + 1}` : `Громадська вбиральня #${idx + 1}`
            const name = t.address || fallbackName
            return `
            <tr class="hover:bg-gray-50 transition-colors">
                <td class="px-4 py-2 text-sm text-gray-900">${t.id || idx + 1}</td>
                <td class="px-4 py-2 text-sm text-gray-700">${name}</td>
                <td class="px-4 py-2 text-sm text-gray-600 font-mono text-right">${t.latitude?.toFixed(5)}</td>
                <td class="px-4 py-2 text-sm text-gray-600 font-mono text-right">${t.longitude?.toFixed(5)}</td>
                <td class="px-4 py-2 text-sm text-center">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${t.type === 'bio' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}">
                        ${t.type === 'bio' ? 'Біо' : 'Публічна'}
                    </span>
                </td>
            </tr>`
        }).join('')
    }

    const html = `
    <!DOCTYPE html>
    <html lang="uk">
    <head>
        <meta charset="UTF-8">
        <title>Звіт просторової статистики</title>
        <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-slate-50 text-slate-800 font-sans p-8">
        <div class="max-w-5xl mx-auto bg-white shadow-lg rounded-xl overflow-hidden">
            <div class="p-6 border-b border-slate-200 bg-slate-50">
                <h1 class="text-2xl font-bold text-slate-900">📊 Просторова статистика вбиральнь</h1>
                <p class="text-slate-500 mt-1">Дата: ${dateStr} | Радіус буфера: ${stats.bufferRadiusKm} км</p>
            </div>
            
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 bg-white">
                <div class="p-4 bg-indigo-50 rounded-lg border border-indigo-100">
                    <div class="text-sm text-indigo-600 font-semibold uppercase">Всього об'єктів</div>
                    <div class="text-2xl font-bold text-indigo-900 mt-1">${stats.totalToilets}</div>
                </div>
                <div class="p-4 bg-emerald-50 rounded-lg border border-emerald-100">
                    <div class="text-sm text-emerald-600 font-semibold uppercase">Сер. відстань до сусіда</div>
                    <div class="text-2xl font-bold text-emerald-900 mt-1">${stats.avgNearestNeighborDistanceMeters} м</div>
                </div>
                <div class="p-4 bg-amber-50 rounded-lg border border-amber-100">
                    <div class="text-sm text-amber-600 font-semibold uppercase">Мін. відстань</div>
                    <div class="text-2xl font-bold text-amber-900 mt-1">${stats.minNearestDistanceMeters} м</div>
                </div>
                <div class="p-4 bg-rose-50 rounded-lg border border-rose-100">
                    <div class="text-sm text-rose-600 font-semibold uppercase">Макс. відстань</div>
                    <div class="text-2xl font-bold text-rose-900 mt-1">${stats.maxNearestDistanceMeters} м</div>
                </div>
            </div>

            <div class="px-6 pb-6">
                <h2 class="text-lg font-semibold text-slate-800 mb-4">Перелік об'єктів</h2>
                <div class="overflow-x-auto border border-slate-200 rounded-lg">
                    <table class="min-w-full divide-y divide-slate-200">
                        <thead class="bg-slate-100">
                            <tr>
                                <th class="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">ID</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Назва / Адреса</th>
                                <th class="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Широта</th>
                                <th class="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Довгота</th>
                                <th class="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Тип</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-slate-200">
                            ${generateRows()}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </body>
    </html>`

    // Функція завантаження (можна винести в утиліти)
    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `gis_spatial_stats_${new Date().toISOString().slice(0,10)}.html`
    document.body.appendChild(link)
    link.click()
    setTimeout(() => {
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
    }, 100)
}