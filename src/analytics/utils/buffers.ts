// src/analytics/utils/buffers.ts

import * as turf from '@turf/turf'
import type { Toilet } from '../../types'
import type {ControlPointAnalysisResult} from "./accessibility.ts";

// 1. Ваша функція для візуалізації кіл на карті (GIS Layer)
export function createBufferPolygons(toilets: Toilet[], radiusKm: number) {
    const validToilets = toilets.filter(
        (t) => t.latitude != null && t.longitude != null
    )

    const points = validToilets.map((t) =>
        turf.point([t.longitude!, t.latitude!], { id: t.id })
    )

    const featureColl = turf.featureCollection(points)

    return turf.buffer(featureColl, radiusKm, { units: 'kilometers' })
}

// 2. Нова функція для обрахунку статистики кастомного буфера під слайдер
export interface CustomBufferStats {
    radiusKm: number
    radiusMeters: number
    totalPoints: number
    coveredCount: number
    coveragePercent: number
}

export function calculateCustomBufferStats(
    results: ControlPointAnalysisResult[],
    radiusKm: number
): CustomBufferStats {
    const radiusMeters = radiusKm * 1000
    const analyzedResults = results.filter((r) => r.analyzed)

    // Точки вважаються покритими, якщо реальна відстань ходьби <= кастомному радіусу
    const coveredCount = analyzedResults.filter(
        (r) => r.walkingDistanceMeters <= radiusMeters
    ).length

    const totalPoints = analyzedResults.length

    return {
        radiusKm,
        radiusMeters,
        totalPoints,
        coveredCount,
        coveragePercent: totalPoints > 0 ? (coveredCount / totalPoints) * 100 : 0,
    }
}