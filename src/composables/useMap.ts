import { ref, shallowRef } from 'vue'
import maplibregl from 'maplibre-gl'

export function useMap() {
    const map = shallowRef<maplibregl.Map | null>(null)
    const zoom = ref(13)
    const center = ref<[number, number]>([35.0461, 48.4647]) // [lng, lat]

    const toiletMarkers = shallowRef<maplibregl.Marker[]>([])
    let userLocationMarker: maplibregl.Marker | null = null

    // Надточні координати кліку для мануального режиму
    const temporaryClickedCoords = ref<[number, number] | null>(null)

    // Ініціалізація карти
    const initMap = (containerId: string, onDragStart: () => void) => {
        const mapInstance = new maplibregl.Map({
            container: containerId,
            style: 'https://tiles.openfreemap.org/styles/bright',
            center: center.value,
            zoom: zoom.value,
            pitch: 0,
            pitchWithRotate: false,
            touchPitch: false,
            dragRotate: true,
            touchZoomRotate: true,
            maxZoom: 19,
            minZoom: 5
        })

        mapInstance.addControl(
            new maplibregl.NavigationControl({ visualizePitch: true }),
            'bottom-right'
        )

        // Слухаємо перетягування (для скидання GPS-стеження)
        mapInstance.on('dragstart', onDragStart)

        // Хак з resize
        mapInstance.on('load', () => {
            mapInstance.resize()
        })

        // Оновлення центру при русі карти
        mapInstance.on('moveend', () => {
            const c = mapInstance.getCenter()
            center.value = [c.lng, c.lat]
            zoom.value = mapInstance.getZoom()
        })

        map.value = mapInstance
        return mapInstance
    }

    // Плавне переміщення камери
    const flyToCoords = (lng: number, lat: number, targetZoom: number) => {
        if (map.value) {
            map.value.flyTo({
                center: [lng, lat],
                zoom: targetZoom,
                essential: true,
                pitch: 0
            })
        }
    }

    // Очищення маркерів туалетів
    const clearToiletMarkers = () => {
        toiletMarkers.value.forEach(m => m.remove())
        toiletMarkers.value = []
    }

    return {
        map,
        zoom,
        center,
        toiletMarkers,
        userLocationMarker,
        temporaryClickedCoords,
        initMap,
        flyToCoords,
        clearToiletMarkers
    }
}