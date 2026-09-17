import { ref, shallowRef } from 'vue'
import maplibregl from 'maplibre-gl'
import type { Point } from 'geojson'
import type { Toilet } from '../types.ts'

export type LatLng = [number, number]
export type LngLat = [number, number]

// Константи для уникнення magic strings & magic numbers
const GREEN_COLOR = '#10b981'
const BLUE_COLOR = '#2563eb'
const ORANGE_COLOR = '#f97316'
const CYAN_COLOR = '#06b6d4'

const SOURCE_IDS = {
    toilets: 'toilets',
    buffers: 'analytics-buffers',
    virtual: 'virtual-toilets-source',
    control: 'control-points-source'
} as const

export function useMap() {
    const map = shallowRef<maplibregl.Map | null>(null)
    const temporaryClickedCoords = ref<LatLng | null>(null)
    const zoom = ref(13)
    const center = ref<LngLat>([35.0461, 48.4647])
    const selectedToiletId = ref<string | null>(null)

    // ==========================================================
    // COORDINATE HELPERS
    // ==========================================================
    const lngLatToLatLng = (lng: number, lat: number): LatLng => [lat, lng]
    const latLngToLngLat = (lat: number, lng: number): LngLat => [lng, lat]

    const getMapCenter = (): maplibregl.LngLat | null => map.value?.getCenter() ?? null

    const getCenterLatLng = (): LatLng | null => {
        const c = getMapCenter()
        return c ? lngLatToLatLng(c.lng, c.lat) : null
    }

    const syncTemporaryCoordsWithCenter = () => {
        const coords = getCenterLatLng()
        if (coords) temporaryClickedCoords.value = coords
    }

    const clearTemporaryCoords = () => {
        temporaryClickedCoords.value = null
    }

    // ==========================================================
    // ICON GENERATOR & HELPERS
    // ==========================================================
    const createWcIcon = (bgColor: string): Promise<HTMLImageElement> => {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas')
            canvas.width = 72
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

                // Фон
                ctx.beginPath()
                ctx.arc(36, 36, 26, 0, 2 * Math.PI)
                ctx.fillStyle = bgColor
                ctx.fill()

                // Текст/Іконка
                ctx.fillStyle = '#ffffff'
                ctx.font = 'normal 400 32px "Material Symbols Outlined", "Material Icons", sans-serif'
                ctx.textAlign = 'center'
                ctx.textBaseline = 'middle'
                ctx.fillText('wc', 36, 36)
            }

            const img = new Image()
            img.src = canvas.toDataURL()
            img.onload = () => resolve(img)
        })
    }

    const ensureIconExists = async (iconId: string, color: string) => {
        if (!map.value || map.value.hasImage(iconId)) return
        const img = await createWcIcon(color)
        if (map.value && !map.value.hasImage(iconId)) {
            map.value.addImage(iconId, img)
        }
    }

    const getIconSizeExpression = (activeId: string | null) => [
        'interpolate',
        ['linear'],
        ['zoom'],
        10, ['case', ['==', ['get', 'id'], activeId || ''], 0.585, 0.45],
        14, ['case', ['==', ['get', 'id'], activeId || ''], 0.715, 0.55],
        17, ['case', ['==', ['get', 'id'], activeId || ''], 0.845, 0.65]
    ]

    // ==========================================================
    // MAP INITIALIZATION
    // ==========================================================
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

        mapInstance.on('dragstart', onDragStart)
        mapInstance.on('load', () => mapInstance.resize())
        mapInstance.on('moveend', () => {
            const c = mapInstance.getCenter()
            center.value = [c.lng, c.lat]
            zoom.value = mapInstance.getZoom()
        })

        map.value = mapInstance
        return mapInstance
    }

    // ==========================================================
    // CAMERA
    // ==========================================================
    const flyToCoords = (lng: number, lat: number, targetZoom: number) => {
        if (!map.value) return
        map.value.setPadding({ top: 0, bottom: 0, left: 0, right: 0 })
        map.value.flyTo({
            center: [lng, lat],
            zoom: targetZoom,
            essential: true,
            pitch: 0
        })
    }

    const fitRouteBounds = (coords: LatLng[]) => {
        if (!map.value || !coords.length) return

        const lats = coords.map((c) => c[0])
        const lngs = coords.map((c) => c[1])

        map.value.fitBounds(
            [
                [Math.min(...lngs), Math.min(...lats)],
                [Math.max(...lngs), Math.max(...lats)]
            ],
            {
                padding: { top: 100, bottom: 160, left: 60, right: 60 },
                duration: 1200,
                essential: true
            }
        )
    }

    // ==========================================================
    // SELECTED TOILET
    // ==========================================================
    const setSelectedToiletId = (id: string | null) => {
        selectedToiletId.value = id
        if (!map.value?.getLayer('unclustered-point')) return

        map.value.setLayoutProperty(
            'unclustered-point',
            'icon-size',
            getIconSizeExpression(id) as any
        )
    }

    // ==========================================================
    // TOILETS & CLUSTERS
    // ==========================================================
    const updateToiletsClustered = async (
        toilets: any[],
        onToiletClick: (id: string) => void
    ) => {
        if (!map.value) return

        const greenIconId = 'wc-green'
        const blueIconId = 'wc-blue'

        await Promise.all([
            ensureIconExists(greenIconId, GREEN_COLOR),
            ensureIconExists(blueIconId, BLUE_COLOR)
        ])

        const geojsonData = {
            type: 'FeatureCollection',
            features: toilets
                .filter((t) => t.latitude != null && t.longitude != null)
                .map((t) => ({
                    type: 'Feature',
                    properties: { id: t.id, type: t.type },
                    geometry: {
                        type: 'Point',
                        coordinates: [t.longitude, t.latitude]
                    }
                }))
        }

        const existingSource = map.value.getSource(SOURCE_IDS.toilets) as maplibregl.GeoJSONSource
        if (existingSource) {
            existingSource.setData(geojsonData as any)
            return
        }

        map.value.addSource(SOURCE_IDS.toilets, {
            type: 'geojson',
            data: geojsonData as any,
            cluster: true,
            clusterMaxZoom: 14,
            clusterRadius: 50
        })

        // Clusters Layer
        map.value.addLayer({
            id: 'clusters',
            type: 'circle',
            source: SOURCE_IDS.toilets,
            filter: ['has', 'point_count'],
            paint: {
                'circle-color': [
                    'step',
                    ['number', ['coalesce', ['get', 'point_count'], 0]],
                    GREEN_COLOR,
                    5, '#059669',
                    15, '#047857'
                ],
                'circle-radius': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    10, ['step', ['number', ['coalesce', ['get', 'point_count'], 0]], 16, 5, 18, 15, 20],
                    14, ['step', ['number', ['coalesce', ['get', 'point_count'], 0]], 20, 5, 24, 15, 28]
                ],
                'circle-stroke-width': 3,
                'circle-stroke-color': '#ffffff'
            }
        })

        // Cluster Count Layer
        map.value.addLayer({
            id: 'cluster-count',
            type: 'symbol',
            source: SOURCE_IDS.toilets,
            filter: ['has', 'point_count'],
            layout: {
                'text-field': ['get', 'point_count_abbreviated'],
                'text-font': ['Noto Sans Bold'],
                'text-size': ['interpolate', ['linear'], ['zoom'], 10, 12, 14, 14]
            },
            paint: { 'text-color': '#ffffff' }
        })

        // Single Toilets Layer
        map.value.addLayer({
            id: 'unclustered-point',
            type: 'symbol',
            source: SOURCE_IDS.toilets,
            filter: ['!', ['has', 'point_count']],
            layout: {
                'icon-image': ['match', ['get', 'type'], 'public', blueIconId, greenIconId],
                'icon-size': getIconSizeExpression(selectedToiletId.value) as any,
                'icon-allow-overlap': true,
                'icon-ignore-placement': true
            }
        })

        // Events
        map.value.on('click', 'clusters', async (e) => {
            const features = map.value!.queryRenderedFeatures(e.point, { layers: ['clusters'] })
            const clusterId = features[0]?.properties?.cluster_id
            if (clusterId == null) return

            const source = map.value!.getSource(SOURCE_IDS.toilets) as maplibregl.GeoJSONSource
            const clusterZoom = await source.getClusterExpansionZoom(clusterId)
            const geometry = features[0].geometry as Point

            map.value!.easeTo({
                center: geometry.coordinates as [number, number],
                zoom: clusterZoom + 0.5
            })
        })

        map.value.on('click', 'unclustered-point', (e) => {
            const features = map.value!.queryRenderedFeatures(e.point, { layers: ['unclustered-point'] })
            const id = features[0]?.properties?.id
            if (!id) return

            setSelectedToiletId(id)
            onToiletClick(id)
        })

        const setPointer = () => {
            if (map.value) map.value.getCanvas().style.cursor = 'pointer'
        }
        const resetCursor = () => {
            if (map.value) map.value.getCanvas().style.cursor = ''
        }

        map.value.on('mouseenter', 'clusters', setPointer)
        map.value.on('mouseleave', 'clusters', resetCursor)
        map.value.on('mouseenter', 'unclustered-point', setPointer)
        map.value.on('mouseleave', 'unclustered-point', resetCursor)
    }

    // ==========================================================
    // GIS ANALYTICS & EXTRA LAYERS
    // ==========================================================
    const renderAnalyticsBuffers = (geojsonData: any) => {
        if (!map.value) return
        const existingSource = map.value.getSource(SOURCE_IDS.buffers) as maplibregl.GeoJSONSource

        if (existingSource) {
            existingSource.setData(geojsonData)
            return
        }

        map.value.addSource(SOURCE_IDS.buffers, { type: 'geojson', data: geojsonData })

        map.value.addLayer(
            {
                id: 'analytics-buffers-fill',
                type: 'fill',
                source: SOURCE_IDS.buffers,
                paint: { 'fill-color': '#6366f1', 'fill-opacity': 0.18 }
            },
            'clusters'
        )

        map.value.addLayer(
            {
                id: 'analytics-buffers-line',
                type: 'line',
                source: SOURCE_IDS.buffers,
                paint: {
                    'line-color': '#4f46e5',
                    'line-width': 1.5,
                    'line-dasharray': [2, 2]
                }
            },
            'clusters'
        )
    }

    const clearAnalyticsBuffers = () => {
        if (!map.value) return
        if (map.value.getLayer('analytics-buffers-fill')) map.value.removeLayer('analytics-buffers-fill')
        if (map.value.getLayer('analytics-buffers-line')) map.value.removeLayer('analytics-buffers-line')
        if (map.value.getSource(SOURCE_IDS.buffers)) map.value.removeSource(SOURCE_IDS.buffers)
    }

    const renderVirtualMarkers = (virtualToilets: Toilet[]) => {
        if (!map.value) return

        const geojsonData = {
            type: 'FeatureCollection',
            features: virtualToilets
                .filter((t) => t.longitude != null && t.latitude != null)
                .map((t) => ({
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [t.longitude!, t.latitude!] },
                    properties: { id: t.id }
                }))
        }

        const existingSource = map.value.getSource(SOURCE_IDS.virtual) as maplibregl.GeoJSONSource
        if (existingSource) {
            existingSource.setData(geojsonData as any)
            return
        }

        map.value.addSource(SOURCE_IDS.virtual, { type: 'geojson', data: geojsonData as any })

        map.value.addLayer({
            id: 'virtual-toilets-halo',
            type: 'circle',
            source: SOURCE_IDS.virtual,
            paint: { 'circle-radius': 14, 'circle-color': ORANGE_COLOR, 'circle-opacity': 0.35 }
        })

        map.value.addLayer({
            id: 'virtual-toilets-point',
            type: 'circle',
            source: SOURCE_IDS.virtual,
            paint: {
                'circle-radius': 7,
                'circle-color': ORANGE_COLOR,
                'circle-stroke-width': 2,
                'circle-stroke-color': '#ffffff'
            }
        })
    }

    const clearVirtualMarkers = () => {
        if (!map.value) return
        if (map.value.getLayer('virtual-toilets-halo')) map.value.removeLayer('virtual-toilets-halo')
        if (map.value.getLayer('virtual-toilets-point')) map.value.removeLayer('virtual-toilets-point')
        if (map.value.getSource(SOURCE_IDS.virtual)) map.value.removeSource(SOURCE_IDS.virtual)
    }

    const renderControlPointsLayer = (controlPoints: any[]) => {
        if (!map.value) return

        const geojsonData = {
            type: 'FeatureCollection',
            features: controlPoints.map((cp) => ({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [cp.longitude, cp.latitude] },
                properties: { name: cp.name, id: cp.id }
            }))
        }

        const existingSource = map.value.getSource(SOURCE_IDS.control) as maplibregl.GeoJSONSource
        if (existingSource) {
            existingSource.setData(geojsonData as any)
            return
        }

        map.value.addSource(SOURCE_IDS.control, { type: 'geojson', data: geojsonData as any })

        map.value.addLayer({
            id: 'control-points-layer',
            type: 'circle',
            source: SOURCE_IDS.control,
            paint: {
                'circle-radius': 6,
                'circle-color': CYAN_COLOR,
                'circle-stroke-width': 2,
                'circle-stroke-color': '#ffffff'
            }
        })
    }

    const clearControlPointsLayer = () => {
        if (!map.value) return
        if (map.value.getLayer('control-points-layer')) map.value.removeLayer('control-points-layer')
        if (map.value.getSource(SOURCE_IDS.control)) map.value.removeSource(SOURCE_IDS.control)
    }

    return {
        map,
        zoom,
        center,
        temporaryClickedCoords,
        selectedToiletId,
        setSelectedToiletId,
        updateToiletsClustered,
        initMap,
        flyToCoords,
        fitRouteBounds,
        lngLatToLatLng,
        latLngToLngLat,
        getMapCenter,
        getCenterLatLng,
        syncTemporaryCoordsWithCenter,
        clearTemporaryCoords,
        renderAnalyticsBuffers,
        clearAnalyticsBuffers,
        renderVirtualMarkers,
        clearVirtualMarkers,
        renderControlPointsLayer,
        clearControlPointsLayer
    }
}