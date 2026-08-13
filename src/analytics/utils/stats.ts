import * as turf from '@turf/turf'
import type { Toilet } from '../../types'

export interface GisSummaryStats {
    totalToilets: number
    bufferRadiusKm: number
    avgNearestNeighborDistanceMeters: number
    minNearestDistanceMeters: number
    maxNearestDistanceMeters: number
}

/**
 * Розраховує просторову щільність та відстані до найближчих сусідів між вбиральнями
 */
export function calculateGisStats(
    toilets: Toilet[],
    bufferRadiusKm: number
): GisSummaryStats {
    const validToilets = toilets.filter(
        (t) => t.latitude != null && t.longitude != null
    )

    if (validToilets.length < 2) {
        return {
            totalToilets: validToilets.length,
            bufferRadiusKm,
            avgNearestNeighborDistanceMeters: 0,
            minNearestDistanceMeters: 0,
            maxNearestDistanceMeters: 0
        }
    }

    const points = validToilets.map((t, index) =>
        turf.point([t.longitude!, t.latitude!], { id: t.id || index })
    )

    // featureColl видалено, щоб не засмічувати пам'ять і прибрати TS6133

    const nearestDistances: number[] = []

    // Для кожної точки знаходимо найближчого сусіда
    points.forEach((pt, idx) => {
        const otherPoints = turf.featureCollection(
            points.filter((_, i) => i !== idx)
        )
        const nearest = turf.nearestPoint(pt, otherPoints)
        const distMeters = turf.distance(pt, nearest, { units: 'meters' })
        nearestDistances.push(distMeters)
    })

    const sum = nearestDistances.reduce((acc, d) => acc + d, 0)
    const avg = sum / nearestDistances.length
    const min = Math.min(...nearestDistances)
    const max = Math.max(...nearestDistances)

    return {
        totalToilets: validToilets.length,
        bufferRadiusKm,
        avgNearestNeighborDistanceMeters: Math.round(avg),
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

    // 1. Метадані аналізу
    let csvContent = '\uFEFF' // UTF-8 BOM для коректного відкриття в Excel
    csvContent += 'ЗВІТ ГІС-АНАЛІТИКИ ДОСТУПНОСТІ МІСЬКИХ ВБИРАЛЬНЬ\n'
    csvContent += `Дата формування;${new Date().toLocaleDateString('uk-UA')}\n`
    csvContent += `Обраний радіус пішої доступності;${stats.bufferRadiusKm * 1000} м (${stats.bufferRadiusKm} км)\n`
    csvContent += `Загальна кількість об'єктів;${stats.totalToilets}\n`
    csvContent += `Середня відстань до найближчого сусіда;${stats.avgNearestNeighborDistanceMeters} м\n`
    csvContent += `Мінімальна відстань між об'єктами;${stats.minNearestDistanceMeters} м\n`
    csvContent += `Максимальна відстань між об'єктами;${stats.maxNearestDistanceMeters} м\n\n`

    // 2. Таблиця точок із їхніми координатами та найближчими сусідами
    csvContent += 'ID;Адреса / Тип;Широта (Latitude);Довгота (Longitude);Відстань до найближчої вбиральні (м)\n'

    const points = validToilets.map((t, index) => {
        // Використовуємо address та type замість title
        const fallbackName = t.type === 'bio' ? `Біотуалет #${index + 1}` : `Громадська вбиральня #${index + 1}`
        const name = t.address || fallbackName
        return turf.point([t.longitude!, t.latitude!], { id: t.id || index, name })
    })

    points.forEach((pt, idx) => {
        const otherPoints = turf.featureCollection(
            points.filter((_, i) => i !== idx)
        )
        const nearest = turf.nearestPoint(pt, otherPoints)
        const distMeters = Math.round(turf.distance(pt, nearest, { units: 'meters' }))
        const toilet = validToilets[idx]

        // Використовуємо address та type замість title
        const fallbackName = toilet.type === 'bio' ? `Біотуалет #${idx + 1}` : `Громадська вбиральня #${idx + 1}`
        const name = (toilet.address || fallbackName).replace(/;/g, ',')

        csvContent += `${toilet.id || idx + 1};"${name}";${toilet.latitude};${toilet.longitude};${distMeters}\n`
    })

    // 3. Завантаження файлу браузером
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `gis_analytics_report_${stats.bufferRadiusKm * 1000}m.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
}