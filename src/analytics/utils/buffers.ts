import * as turf from '@turf/turf'
import type { Toilet } from '../../types'

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