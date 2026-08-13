import * as turf from '@turf/turf'

export interface CircuityResult {
    straightDistanceMeters: number
    osrmDistanceMeters: number
    circuityFactor: number
    detourPercentage: number
}

/**
 * Розраховує коефіцієнт відхилення (Circuity Factor)
 * @param start - Початкова точка [lat, lng]
 * @param end - Фінішна точка [lat, lng]
 * @param osrmDistanceMeters - Відстань OSRM у метрах
 */
export function calculateCircuity(
    start: [number, number],
    end: [number, number],
    osrmDistanceMeters: number
): CircuityResult {
    // Turf очікує координати у форматі [lng, lat]
    const p1 = turf.point([start[1], start[0]])
    const p2 = turf.point([end[1], end[0]])

    const straightDistanceMeters = turf.distance(p1, p2, { units: 'meters' })

    if (straightDistanceMeters === 0) {
        return {
            straightDistanceMeters: 0,
            osrmDistanceMeters,
            circuityFactor: 1,
            detourPercentage: 0
        }
    }

    const factor = osrmDistanceMeters / straightDistanceMeters
    const detourPercentage = Math.round((factor - 1) * 100)

    return {
        straightDistanceMeters: Math.round(straightDistanceMeters),
        osrmDistanceMeters: Math.round(osrmDistanceMeters),
        circuityFactor: Number(factor.toFixed(2)),
        detourPercentage: Math.max(0, detourPercentage)
    }
}