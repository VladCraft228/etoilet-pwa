import { ref, shallowRef } from 'vue'
import maplibregl from 'maplibre-gl'

export function useMap() {
    const map = ref<maplibregl.Map | null>(null)
    const temporaryClickedCoords = ref<[number, number] | null>(null)
    const zoom = ref(13)
    const center = ref<[number, number]>([35.0461, 48.4647]) // [lng, lat]

    const toiletMarkers = shallowRef<maplibregl.Marker[]>([])
    let userLocationMarker: maplibregl.Marker | null = null

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

    // Функція для оновлення туалетів на карті за допомогою кластеризації
    const updateToiletsClustered = (toilets: any[], onToiletClick: (id: string) => void) => {
        if (!map.value) return

        const sourceId = 'toilets'

        // Генерація іконок через HTML Canvas та додавання в пам'ять карти як Image
        // Це гарантує ідеальне згладжування (anti-aliasing) і нульове навантаження на CPU/RAM
        const createWcIcon = (bgColor: string): Promise<HTMLImageElement> => {
            return new Promise((resolve) => {
                const canvas = document.createElement('canvas')
                canvas.width = 72 // 2x для Retina дисплеїв (ідеальна чіткість)
                canvas.height = 72
                const ctx = canvas.getContext('2d')

                if (ctx) {
                    // Тінь
                    ctx.beginPath()
                    ctx.arc(36, 36, 32, 0, 2 * Math.PI)
                    ctx.fillStyle = 'rgba(0,0,0,0.15)'
                    ctx.fill()

                    // Біла рамка
                    ctx.beginPath()
                    ctx.arc(36, 36, 30, 0, 2 * Math.PI)
                    ctx.fillStyle = '#ffffff'
                    ctx.fill()

                    // Кольоровий фон
                    ctx.beginPath()
                    ctx.arc(36, 36, 26, 0, 2 * Math.PI)
                    ctx.fillStyle = bgColor
                    ctx.fill()

                    // Налаштування тексту під Material Symbols
                    ctx.fillStyle = '#ffffff'
                    ctx.font = 'normal 400 32px "Material Symbols Outlined", "Material Icons", sans-serif'
                    ctx.textAlign = 'center'
                    ctx.textBaseline = 'middle'
                    ctx.fillText('wc', 36, 36) // Малюємо лігатуру
                }

                const img = new Image()
                img.src = canvas.toDataURL()
                img.onload = () => resolve(img)
            })
        }

        // Додаємо іконки в карту один раз
        const greenIconId = 'wc-green'
        const blueIconId = 'wc-blue'

        if (!map.value.hasImage(greenIconId)) {
            createWcIcon('#10b981').then(img => {
                if (map.value && !map.value.hasImage(greenIconId)) map.value.addImage(greenIconId, img)
            })
        }
        if (!map.value.hasImage(blueIconId)) {
            createWcIcon('#2563eb').then(img => {
                if (map.value && !map.value.hasImage(blueIconId)) map.value.addImage(blueIconId, img)
            })
        }

        // GeoJSON дані
        const geojsonData = {
            type: 'FeatureCollection',
            features: toilets.map(t => ({
                type: 'Feature',
                properties: {
                    id: t.id,
                    type: t.type
                },
                geometry: {
                    type: 'Point',
                    coordinates: [t.longitude, t.latitude]
                }
            }))
        }

        const existingSource = map.value.getSource(sourceId) as maplibregl.GeoJSONSource
        if (existingSource) {
            existingSource.setData(geojsonData as any)
            return
        }

        map.value.addSource(sourceId, {
            type: 'geojson',
            data: geojsonData as any,
            cluster: true,
            clusterMaxZoom: 14,
            clusterRadius: 50
        })

        // 1. Шар кластерів (кружечки) — додано інтерполяцію радіуса від зуму
        map.value.addLayer({
            id: 'clusters',
            type: 'circle',
            source: sourceId,
            filter: ['has', 'point_count'],
            paint: {
                'circle-color': ['step', ['get', 'point_count'], '#10B981', 5, '#059669', 15, '#047857'],
                // Динамічний радіус: базовий розмір залежить від кількості, але масштабується із зумом
                'circle-radius': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    10, ['step', ['get', 'point_count'], 16, 5, 18, 15, 20],
                    14, ['step', ['get', 'point_count'], 20, 5, 24, 15, 28]
                ],
                'circle-stroke-width': 3,
                'circle-stroke-color': '#ffffff'
            }
        })

// 2. Цифри всередині кластерів — розмір тексту тепер теж плавно росте
        map.value.addLayer({
            id: 'cluster-count',
            type: 'symbol',
            source: sourceId,
            filter: ['has', 'point_count'],
            layout: {
                'text-field': ['get', 'point_count_abbreviated'],
                'text-font': ['Noto Sans Bold'],
                'text-size': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    10, 12,
                    14, 14
                ]
            },
            paint: {
                'text-color': '#ffffff'
            }
        })

// 3. Одиночні маркери — затиснуті в адекватні рамки
        map.value.addLayer({
            id: 'unclustered-point',
            type: 'symbol',
            source: sourceId,
            filter: ['!', ['has', 'point_count']],
            layout: {
                'icon-image': [
                    'match',
                    ['get', 'type'],
                    'public', blueIconId,
                    greenIconId
                ],
                // Збалансована шкала: від акуратних 32px до чітких, але не величезних 46px
                'icon-size': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    10, 0.45, // ~32px (акуратні на віддалі)
                    14, 0.55, // ~40px (дефолтний чіткий розмір)
                    17, 0.65  // ~46px (максимальний розмір на макро-зумі)
                ],
                'icon-allow-overlap': true,
                'icon-ignore-placement': true
            }
        })

        // --- ІНТЕРАКТИВНІСТЬ ---

        map.value.on('click', 'clusters', async (e) => {
            const features = map.value!.queryRenderedFeatures(e.point, { layers: ['clusters'] })
            const clusterId = features[0].properties.cluster_id
            const source = map.value!.getSource(sourceId) as maplibregl.GeoJSONSource
            const zoom = await source.getClusterExpansionZoom(clusterId)
            map.value!.easeTo({ center: (features[0].geometry as any).coordinates, zoom: zoom + 0.5 })
        })

        map.value.on('click', 'unclustered-point', (e) => {
            const features = map.value!.queryRenderedFeatures(e.point, { layers: ['unclustered-point'] })
            if (!features.length) return
            onToiletClick(features[0].properties.id)
        })

        const setPointer = () => { map.value!.getCanvas().style.cursor = 'pointer' }
        const resetCursor = () => { map.value!.getCanvas().style.cursor = '' }
        map.value.on('mouseenter', 'clusters', setPointer)
        map.value.on('mouseleave', 'clusters', resetCursor)
        map.value.on('mouseenter', 'unclustered-point', setPointer)
        map.value.on('mouseleave', 'unclustered-point', resetCursor)
    }
    // Додай цю функцію всередину useMap()
    const fitRouteBounds = (coords: [number, number][]) => {
        if (!map.value || coords.length === 0) return

        // coords приходять у форматі [lat, lng]
        const lats = coords.map(c => c[0])
        const lngs = coords.map(c => c[1])

        const minLat = Math.min(...lats)
        const maxLat = Math.max(...lats)
        const minLng = Math.min(...lngs)
        const maxLng = Math.max(...lngs)

        map.value.fitBounds(
            [
                [minLng, minLat], // Південно-західний кут
                [maxLng, maxLat]  // Північно-східний кут
            ],
            {
                // Відступи у пікселях, щоб маршрут не залазив під UI-плашки
                padding: { top: 100, bottom: 160, left: 60, right: 60 },
                duration: 1200,
                essential: true
            }
        )
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
        updateToiletsClustered,
        initMap,
        flyToCoords,
        fitRouteBounds,
        clearToiletMarkers
    }
}