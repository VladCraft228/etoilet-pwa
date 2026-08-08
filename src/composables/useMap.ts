import { ref, shallowRef } from 'vue'
import maplibregl from 'maplibre-gl'
import type { Point } from 'geojson'

export type LatLng = [number, number]
export type LngLat = [number, number]

export function useMap() {
    const map = shallowRef<maplibregl.Map | null>(null)

    /**
     * Тимчасова позиція користувача під час manual selection.
     *
     * ВАЖЛИВО:
     * тут завжди [lat, lng].
     *
     * MapLibre використовує [lng, lat],
     * але зовнішня логіка застосунку працює з [lat, lng].
     */
    const temporaryClickedCoords = ref<LatLng | null>(null)

    const zoom = ref(13)

    /**
     * center — виключно у форматі MapLibre:
     * [lng, lat]
     */
    const center = ref<LngLat>([35.0461, 48.4647])

    const toiletMarkers =
        shallowRef<maplibregl.Marker[]>([])

    // Залишаємо для сумісності з поточним кодом.
    let userLocationMarker: maplibregl.Marker | null = null

    /**
     * Стан вибраного туалету.
     */
    const selectedToiletId =
        ref<string | null>(null)

    // ==========================================================
    // COORDINATE HELPERS
    // ==========================================================

    /**
     * MapLibre [lng, lat] -> App [lat, lng]
     */
    const lngLatToLatLng = (
        lng: number,
        lat: number
    ): LatLng => {
        return [lat, lng]
    }

    /**
     * App [lat, lng] -> MapLibre [lng, lat]
     */
    const latLngToLngLat = (
        lat: number,
        lng: number
    ): LngLat => {
        return [lng, lat]
    }

    /**
     * Отримати поточний центр карти
     * у форматі застосунку [lat, lng].
     */
    const getCenterLatLng = (): LatLng | null => {
        if (!map.value) {
            return null
        }

        const currentCenter =
            map.value.getCenter()

        return lngLatToLatLng(
            currentCenter.lng,
            currentCenter.lat
        )
    }

    /**
     * Синхронізує temporaryClickedCoords
     * з центром карти.
     *
     * Використовується під час ручного вибору.
     */
    const syncTemporaryCoordsWithCenter = () => {
        const coords =
            getCenterLatLng()

        if (coords) {
            temporaryClickedCoords.value =
                coords
        }
    }

    /**
     * Очищення тимчасової точки.
     */
    const clearTemporaryCoords = () => {
        temporaryClickedCoords.value = null
    }

    // ==========================================================
    // ICON SIZE
    // ==========================================================

    const getIconSizeExpression = (
        activeId: string | null
    ) => {
        return [
            'interpolate',
            ['linear'],
            ['zoom'],

                10,
                [
                    'case',
                    [
                        '==',
                        ['get', 'id'],
                        activeId || ''
                    ],
                    0.45 * 1.3,
                    0.45
                ],

                14,
                [
                    'case',
                    [
                        '==',
                        ['get', 'id'],
                        activeId || ''
                    ],
                    0.55 * 1.3,
                    0.55
                ],

                17,
                [
                    'case',
                    [
                        '==',
                        ['get', 'id'],
                        activeId || ''
                    ],
                    0.65 * 1.3,
                    0.65
                ]
            ]
    }

    // ==========================================================
    // MAP INITIALIZATION
    // ==========================================================

    const initMap = (
        containerId: string,
        onDragStart: () => void
    ) => {
        const mapInstance =
            new maplibregl.Map({
                container: containerId,

                style:
                    'https://tiles.openfreemap.org/styles/bright',

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

        // ------------------------------------------------------
        // DRAG START
        // ------------------------------------------------------

        mapInstance.on(
            'dragstart',
            onDragStart
        )

        // ------------------------------------------------------
        // MAP LOAD
        // ------------------------------------------------------

        mapInstance.on(
            'load',
            () => {
                mapInstance.resize()
            }
        )

        // ------------------------------------------------------
        // MOVE END
        // ------------------------------------------------------

        mapInstance.on(
            'moveend',
            () => {
                const currentCenter =
                    mapInstance.getCenter()

                center.value = [
                    currentCenter.lng,
                    currentCenter.lat
                ]

                zoom.value =
                    mapInstance.getZoom()
            }
        )

        map.value = mapInstance

        return mapInstance
    }

    // ==========================================================
    // CAMERA
    // ==========================================================

    const flyToCoords = (
        lng: number,
        lat: number,
        targetZoom: number
    ) => {
        if (!map.value) {
            return
        }

        map.value.flyTo({
            center: [
                lng,
                lat
            ],
            zoom: targetZoom,
            essential: true,
            pitch: 0
        })
    }

    // ==========================================================
    // SELECTED TOILET
    // ==========================================================

    const setSelectedToiletId = (
        id: string | null
    ) => {
        selectedToiletId.value = id

        if (
            !map.value ||
            !map.value.getLayer(
                'unclustered-point'
            )
        ) {
            return
        }

        map.value.setLayoutProperty(
            'unclustered-point',
            'icon-size',
            getIconSizeExpression(id) as any
        )
    }

    // ==========================================================
    // TOILETS
    // ==========================================================

    const updateToiletsClustered = (
        toilets: any[],
        onToiletClick: (
            id: string
        ) => void
    ) => {
        if (!map.value) {
            return
        }

        const sourceId = 'toilets'

        // ------------------------------------------------------
        // ICON GENERATOR
        // ------------------------------------------------------

        const createWcIcon = (
            bgColor: string
        ): Promise<HTMLImageElement> => {
            return new Promise(
                (resolve) => {
                    const canvas =
                        document.createElement(
                            'canvas'
                        )

                    canvas.width = 72
                    canvas.height = 72

                    const ctx =
                        canvas.getContext(
                            '2d'
                        )

                    if (ctx) {
                        // Тінь
                        ctx.beginPath()
                        ctx.arc(
                            36,
                            36,
                            32,
                            0,
                            2 * Math.PI
                        )

                        ctx.fillStyle =
                            'rgba(0,0,0,0.15)'

                        ctx.fill()

                        // Біла рамка
                        ctx.beginPath()
                        ctx.arc(
                            36,
                            36,
                            30,
                            0,
                            2 * Math.PI
                        )

                        ctx.fillStyle =
                            '#ffffff'

                        ctx.fill()

                        // Фон
                        ctx.beginPath()
                        ctx.arc(
                            36,
                            36,
                            26,
                            0,
                            2 * Math.PI
                        )

                        ctx.fillStyle =
                            bgColor

                        ctx.fill()

                        // Material Symbols
                        ctx.fillStyle =
                            '#ffffff'

                        ctx.font =
                            'normal 400 32px "Material Symbols Outlined", "Material Icons", sans-serif'

                        ctx.textAlign =
                            'center'

                        ctx.textBaseline =
                            'middle'

                        ctx.fillText(
                            'wc',
                            36,
                            36
                        )
                    }

                    const img =
                        new Image()

                    img.src =
                        canvas.toDataURL()

                    img.onload = () =>
                        resolve(img)
                }
            )
        }

        // ------------------------------------------------------
        // ICONS
        // ------------------------------------------------------

        const greenIconId =
            'wc-green'

        const blueIconId =
            'wc-blue'

        if (
            !map.value.hasImage(
                greenIconId
            )
        ) {
            createWcIcon('#10b981')
                .then(img => {
                    if (
                        map.value &&
                        !map.value.hasImage(
                            greenIconId
                        )
                    ) {
                        map.value.addImage(
                            greenIconId,
                            img
                        )
                    }
                })
        }

        if (
            !map.value.hasImage(
                blueIconId
            )
        ) {
            createWcIcon('#2563eb')
                .then(img => {
                    if (
                        map.value &&
                        !map.value.hasImage(
                            blueIconId
                        )
                    ) {
                        map.value.addImage(
                            blueIconId,
                            img
                        )
                    }
                })
        }

        // ------------------------------------------------------
        // GEOJSON
        // ------------------------------------------------------

        const geojsonData = {
            type: 'FeatureCollection',

            features: toilets
                .filter(
                    t =>
                        t.latitude != null &&
                        t.longitude != null
                )
                .map(t => ({
                    type: 'Feature',

                    properties: {
                        id: t.id,
                        type: t.type
                    },

                    geometry: {
                        type: 'Point',

                        coordinates: [
                            t.longitude,
                            t.latitude
                        ]
                    }
                }))
        }

        // ------------------------------------------------------
        // EXISTING SOURCE
        // ------------------------------------------------------

        const existingSource =
            map.value.getSource(
                sourceId
            ) as
                | maplibregl.GeoJSONSource
                | undefined

        if (existingSource) {
            existingSource.setData(
                geojsonData as any
            )

            return
        }

        // ------------------------------------------------------
        // SOURCE
        // ------------------------------------------------------

        map.value.addSource(
            sourceId,
            {
                type: 'geojson',
                data: geojsonData as any,

                cluster: true,
                clusterMaxZoom: 14,
                clusterRadius: 50
            }
        )

        // ------------------------------------------------------
        // CLUSTERS
        // ------------------------------------------------------

        map.value.addLayer({
            id: 'clusters',

            type: 'circle',

            source: sourceId,

            filter: [
                'has',
                'point_count'
            ],

            paint: {
                'circle-color': [
                    'step',
                    [
                        'get',
                        'point_count'
                    ],
                    '#10B981',
                    5,
                    '#059669',
                    15,
                    '#047857'
                ],

                'circle-radius': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],

                    10,
                    [
                        'step',
                        [
                            'get',
                            'point_count'
                        ],
                        16,
                        5,
                        18,
                        15,
                        20
                    ],

                    14,
                    [
                        'step',
                        [
                            'get',
                            'point_count'
                        ],
                        20,
                        5,
                        24,
                        15,
                        28
                    ]
                ],

                'circle-stroke-width': 3,

                'circle-stroke-color':
                    '#ffffff'
            }
        })

        // ------------------------------------------------------
        // CLUSTER COUNT
        // ------------------------------------------------------

        map.value.addLayer({
            id: 'cluster-count',

            type: 'symbol',

            source: sourceId,

            filter: [
                'has',
                'point_count'
            ],

            layout: {
                'text-field': [
                    'get',
                    'point_count_abbreviated'
                ],

                'text-font': [
                    'Noto Sans Bold'
                ],

                'text-size': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    10,
                    12,
                    14,
                    14
                ]
            },

            paint: {
                'text-color':
                    '#ffffff'
            }
        })

        // ------------------------------------------------------
        // SINGLE TOILETS
        // ------------------------------------------------------

        map.value.addLayer({
            id: 'unclustered-point',

            type: 'symbol',

            source: sourceId,

            filter: [
                '!',
                [
                    'has',
                    'point_count'
                ]
            ],

            layout: {
                'icon-image': [
                    'match',
                    ['get', 'type'],

                    'public',
                    blueIconId,

                    greenIconId
                ],

                'icon-size':
                    getIconSizeExpression(
                        selectedToiletId.value
                    ) as any,

                'icon-allow-overlap':
                    true,

                'icon-ignore-placement':
                    true
            }
        })

        // ======================================================
        // INTERACTIVITY
        // ======================================================

        map.value.on(
            'click',
            'clusters',
            async e => {
                const features =
                    map.value!.queryRenderedFeatures(
                        e.point,
                        {
                            layers: [
                                'clusters'
                            ]
                        }
                    )

                if (!features.length) {
                    return
                }

                const clusterId =
                    features[0].properties
                        ?.cluster_id

                if (
                    clusterId == null
                ) {
                    return
                }

                const source =
                    map.value!.getSource(
                        sourceId
                    ) as
                        maplibregl.GeoJSONSource

                const clusterZoom =
                    await source.getClusterExpansionZoom(
                        clusterId
                    )

                const geometry =
                    features[0].geometry as
                        Point

                map.value!.easeTo({
                    center:
                        geometry.coordinates as [
                            number,
                            number
                        ],

                    zoom:
                        clusterZoom + 0.5
                })
            }
        )

        map.value.on(
            'click',
            'unclustered-point',
            e => {
                const features =
                    map.value!.queryRenderedFeatures(
                        e.point,
                        {
                            layers: [
                                'unclustered-point'
                            ]
                        }
                    )

                if (
                    !features.length
                ) {
                    return
                }

                const id =
                    features[0].properties
                        ?.id

                if (!id) {
                    return
                }

                setSelectedToiletId(
                    id
                )

                onToiletClick(id)
            }
        )

        // ------------------------------------------------------
        // CURSOR
        // ------------------------------------------------------

        const setPointer = () => {
            if (map.value) {
                map.value
                    .getCanvas()
                    .style.cursor =
                    'pointer'
            }
        }

        const resetCursor = () => {
            if (map.value) {
                map.value
                    .getCanvas()
                    .style.cursor =
                    ''
            }
        }

        map.value.on(
            'mouseenter',
            'clusters',
            setPointer
        )

        map.value.on(
            'mouseleave',
            'clusters',
            resetCursor
        )

        map.value.on(
            'mouseenter',
            'unclustered-point',
            setPointer
        )

        map.value.on(
            'mouseleave',
            'unclustered-point',
            resetCursor
        )
    }

    // ==========================================================
    // ROUTE BOUNDS
    // ==========================================================

    const fitRouteBounds = (
        coords: LatLng[]
    ) => {
        if (
            !map.value ||
            coords.length === 0
        ) {
            return
        }

        const lats =
            coords.map(c => c[0])

        const lngs =
            coords.map(c => c[1])

        const minLat =
            Math.min(...lats)

        const maxLat =
            Math.max(...lats)

        const minLng =
            Math.min(...lngs)

        const maxLng =
            Math.max(...lngs)

        map.value.fitBounds(
            [
                [minLng, minLat],
                [maxLng, maxLat]
            ],

            {
                padding: {
                    top: 100,
                    bottom: 160,
                    left: 60,
                    right: 60
                },

                duration: 1200,
                essential: true
            }
        )
    }

    // ==========================================================
    // MARKERS
    // ==========================================================

    const clearToiletMarkers = () => {
        toiletMarkers.value.forEach(
            marker => marker.remove()
        )

        toiletMarkers.value = []
    }

    // ==========================================================
    // RETURN
    // ==========================================================

    return {
        map,
        zoom,
        center,
        toiletMarkers,
        userLocationMarker,
        temporaryClickedCoords,
        selectedToiletId,
        setSelectedToiletId,
        updateToiletsClustered,
        initMap,
        flyToCoords,
        fitRouteBounds,
        clearToiletMarkers,
        // Coordinate helpers
        lngLatToLatLng,
        latLngToLngLat,
        getCenterLatLng,
        // Manual selection
        syncTemporaryCoordsWithCenter,
        clearTemporaryCoords
    }
}