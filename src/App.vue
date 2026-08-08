<script setup lang="ts">
import {
  ref,
  watch,
  onMounted,
  onUnmounted,
  defineAsyncComponent,
  nextTick
} from 'vue'

import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

// --- СЕРВІСИ ТА COMPOSABLES ---
import { toiletService } from './services/toiletService'
import { useGeolocation } from './composables/useGeolocation'
import { useRouting } from './composables/useRouting'
import { useMap } from './composables/useMap'
import { useAuth } from './composables/useAuth'
import { useRealtimeToilets } from './composables/useRealtimeToilets'
import { useToast } from 'vue-toastification'

// --- БАЗОВІ КОМПОНЕНТИ ---
import AppNavigation from './components/ui/AppNavigation.vue'
import MapControls from './components/map/MapControls.vue'
import ToiletTargetingOverlay from './components/map/ToiletTargetingOverlay.vue'
import UserTargetingOverlay from './components/map/UserTargetingOverlay.vue'
import RouteInfoBanner from './components/map/RouteInfoBanner.vue'
import ToiletPopupCard from './components/map/ToiletPopupCard.vue'
import ToiletBottomSheet from './components/map/ToiletBottomSheet.vue'
import AdminView from './components/views/AdminView.vue'
import LoginView from './components/views/LoginView.vue'
import EditToiletModal from './components/features/EditToiletModal.vue'
import RelocateOverlay from './components/map/RelocateOverlay.vue'

import type { Toilet } from './types.ts'

// --- ЛІНИВІ КОМПОНЕНТИ ---
const LocationPrompt = defineAsyncComponent(
    () => import('./components/features/LocationPrompt.vue')
)

const AddToiletForm = defineAsyncComponent(
    () => import('./components/features/AddToiletForm.vue')
)

const AddressSearchModal = defineAsyncComponent(
    () => import('./components/features/AddressSearchModal.vue')
)

const WelcomeModal = defineAsyncComponent(
    () => import('./components/features/WelcomeModal.vue')
)

const RouteChoiceModal = defineAsyncComponent(
    () => import('./components/features/RouteChoiceModal.vue')
)

// ==========================================================
// СТАН ДОДАТКУ
// ==========================================================

const currentScreen =
    ref<'map' | 'login' | 'admin'>('map')

const adminFocusToiletId =
    ref<string | null>(null)

// ==========================================================
// COMPOSABLES
// ==========================================================

const {
  isAdmin,
  initAuth,
  handleLogout
} = useAuth()

const {
  approvedToilets,
  hasNewData,
  refreshMapData,
  initRealtime,
  loadToiletsData
} = useRealtimeToilets()

const {
  userLocation,
  isLocating,
  startTrackingLocation,
  stopTrackingLocation
} = useGeolocation()

const {
  activeRouteCoords,
  routeInfo,
  buildRoute,
  clearRoute
} = useRouting()

const {
  map,
  center,
  temporaryClickedCoords,

  initMap,
  flyToCoords,
  fitRouteBounds,
  updateToiletsClustered,
  setSelectedToiletId,

  getCenterLatLng,
  syncTemporaryCoordsWithCenter,
  clearTemporaryCoords
} = useMap()

const toast = useToast()

// ==========================================================
// UI / MODALS
// ==========================================================

const showWelcomeModal =
    ref(false)

const showLocationPrompt =
    ref(false)

const showRouteChoiceModal =
    ref(false)

const isAddressSearchOpen =
    ref(false)

const isAddFormOpen =
    ref(false)

const isEditModalOpen =
    ref(false)

const toiletToEdit =
    ref<Toilet | null>(null)

// ==========================================================
// MAP STATE
// ==========================================================

const isFollowUserActive =
    ref(false)

const isManualSelectionMode =
    ref(false)

const isPickingToiletMode =
    ref(false)

const selectedToiletCoords =
    ref<[number, number] | null>(null)

const addressSearchContext =
    ref<'user' | 'toilet'>('user')

const targetToiletForRoute =
    ref<
        Toilet |
        {
          latitude: number
          longitude: number
        } |
        null
    >(null)

// ==========================================================
// ROUTING STATE
// ==========================================================

const ROUTE_REBUILD_DISTANCE = 25

const lastRoutedLocation =
    ref<[number, number] | null>(null)

const isRouting =
    ref(false)

const pendingRouteLocation =
    ref<[number, number] | null>(null)

// ==========================================================
// MARKERS / POPUPS
// ==========================================================

const isRelocatingMode =
    ref(false)

const relocatingToiletId =
    ref<string | null>(null)

let userLocationMarker:
    maplibregl.Marker | null = null

let pendingReviewMarker:
    maplibregl.Marker | null = null

const activeToiletForPopup =
    ref<Toilet | null>(null)

// ==========================================================
// RESPONSIVE
// ==========================================================

const DESKTOP_BREAKPOINT = 640

const isDesktop =
    ref(
        window.innerWidth >=
        DESKTOP_BREAKPOINT
    )

// ==========================================================
// POPUP
// ==========================================================

const popupContentRef =
    ref<HTMLElement | null>(null)

let activeMapPopup:
    maplibregl.Popup | null = null

// ==========================================================
// HELPERS
// ==========================================================

function getDistanceMeters(
    a: [number, number],
    b: [number, number]
) {
  const R = 6371e3

  const lat1 =
      a[0] * Math.PI / 180

  const lat2 =
      b[0] * Math.PI / 180

  const deltaLat =
      (b[0] - a[0]) *
      Math.PI / 180

  const deltaLng =
      (b[1] - a[1]) *
      Math.PI / 180

  const value =
      Math.sin(deltaLat / 2) ** 2 +
      Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLng / 2) ** 2

  return (
      2 *
      R *
      Math.atan2(
          Math.sqrt(value),
          Math.sqrt(1 - value)
      )
  )
}

// ==========================================================
// POPUP / TOILET
// ==========================================================

watch(
    activeToiletForPopup,
    newToilet => {
      setSelectedToiletId(
          newToilet
              ? newToilet.id
              : null
      )
    }
)

const handleResize = () => {
  const wasDesktop =
      isDesktop.value

  isDesktop.value =
      window.innerWidth >=
      DESKTOP_BREAKPOINT

  if (
      wasDesktop !==
      isDesktop.value &&
      activeToiletForPopup.value
  ) {
    if (activeMapPopup) {
      activeMapPopup.remove()
      activeMapPopup = null
    }

    if (isDesktop.value) {
      nextTick(() => {
        openDesktopPopup(
            activeToiletForPopup.value!
        )
      })
    }
  }
}

const openDesktopPopup = (
    toilet: Toilet
) => {
  if (
      !map.value ||
      !popupContentRef.value
  ) {
    return
  }

  if (
      toilet.longitude == null ||
      toilet.latitude == null
  ) {
    return
  }

  if (activeMapPopup) {
    activeMapPopup.remove()
  }

  activeMapPopup =
      new maplibregl.Popup({
        closeButton: true,
        closeOnClick: true,
        anchor: 'bottom',
        offset: 25,
        maxWidth: '300px'
      })
          .setDOMContent(
              popupContentRef.value
          )
          .setLngLat([
            toilet.longitude,
            toilet.latitude
          ])
          .addTo(
              map.value
          )

  activeMapPopup.on(
      'close',
      () => {
        if (
            activeToiletForPopup
                .value?.id === toilet.id
        ) {
          activeToiletForPopup.value =
              null

          setSelectedToiletId(null)
        }
      }
  )
}

// ==========================================================
// NAVIGATION
// ==========================================================

const navigateTo = (
    screen:
        'map' |
        'login' |
        'admin'
) => {
  if (screen === 'map') {
    adminFocusToiletId.value =
        null
  }

  if (
      screen === 'admin' &&
      !isAdmin.value
  ) {
    currentScreen.value =
        'login'

    return
  }

  currentScreen.value =
      screen
}

const onLogout = () => {
  handleLogout(
      currentScreen
  )
}

// ==========================================================
// TOILET SELECTION
// ==========================================================

const selectToiletById = (
    id: string
) => {
  if (!map.value) {
    return
  }

  const toilet =
      approvedToilets.value.find(
          t => t.id === id
      )

  if (!toilet) {
    return
  }

  if (
      toilet.longitude == null ||
      toilet.latitude == null
  ) {
    return
  }

  activeToiletForPopup.value =
      toilet

  if (isDesktop.value) {
    nextTick(() => {
      openDesktopPopup(toilet)
    })

    map.value.flyTo({
      center: [
        toilet.longitude,
        toilet.latitude
      ],

      zoom: Math.max(
          map.value.getZoom(),
          16
      ),

      padding: {
        top: 350,
        bottom: 50,
        left: 20,
        right: 20
      },

      speed: 1.2
    })
  } else {
    map.value.flyTo({
      center: [
        toilet.longitude,
        toilet.latitude
      ],

      zoom: Math.max(
          map.value.getZoom(),
          16
      ),

      padding: {
        bottom:
            window.innerHeight * 0.4
      },

      speed: 1.2
    })
  }
}

const closeActivePopup = () => {
  if (activeMapPopup) {
    activeMapPopup.remove()
    activeMapPopup = null
  }

  activeToiletForPopup.value =
      null

  setSelectedToiletId(null)
}

const handlePopupRoute = () => {
  if (
      activeToiletForPopup.value
  ) {
    openRouteChoice(
        activeToiletForPopup.value
    )
  }

  closeActivePopup()
}

// ==========================================================
// GPS
// ==========================================================

const handleGpsLocation = () => {
  showLocationPrompt.value =
      false

  /**
   * Якщо користувач був у manual mode,
   * GPS має однозначно його скасувати.
   */
  if (
      isManualSelectionMode.value
  ) {
    isManualSelectionMode.value =
        false

    clearTemporaryCoords()
  }

  /**
   * Повторне натискання GPS,
   * коли tracking уже активний,
   * вимикає tracking.
   */
  if (
      isFollowUserActive.value
  ) {
    stopTrackingLocation()

    isFollowUserActive.value =
        false

    return
  }

  isFollowUserActive.value =
      true

  startTrackingLocation(
      (lat, lng) => {
        flyToCoords(
            lng,
            lat,
            16
        )
      },

      () => {
        isFollowUserActive.value =
            false
      }
  )
}

// ==========================================================
// MANUAL USER LOCATION
// ==========================================================

const handleManualLocation = () => {
  showLocationPrompt.value =
      false

  /**
   * Manual mode завжди вимикає
   * GPS tracking.
   */
  if (
      isFollowUserActive.value
  ) {
    stopTrackingLocation()

    isFollowUserActive.value =
        false
  }

  /**
   * Якщо вже були якісь старі
   * тимчасові координати —
   * не використовуємо їх.
   */
  clearTemporaryCoords()

  isManualSelectionMode.value =
      true

  /**
   * Початковою точкою manual selection
   * є поточний центр карти.
   */
  syncTemporaryCoordsWithCenter()
}

const confirmManualLocation = () => {
  if (!map.value) return

  // Єдине джерело істини — поточний центр карти під прицілом
  const mapCenter = map.value.getCenter()

  // Записуємо у форматі застосунку [lat, lng]
  userLocation.value = [mapCenter.lat, mapCenter.lng]

  // Вимикаємо режим
  isManualSelectionMode.value = false
}

// ==========================================================
// ADD TOILET
// ==========================================================

const startPickingToiletLocation = () => {
  /**
   * Не дозволяємо одночасно мати
   * manual user location.
   */
  if (
      isManualSelectionMode.value
  ) {
    cancelManualLocation()
  }

  isPickingToiletMode.value =
      true

  clearTemporaryCoords()

  syncTemporaryCoordsWithCenter()
}

const snapToiletToUserGps = () => {
  startTrackingLocation(
      (lat, lng) => {
        flyToCoords(
            lng,
            lat,
            18
        )

        stopTrackingLocation()
      }
  )
}

const confirmToiletLocation = () => {
  if (!map.value) {
    return
  }

  const coords =
      temporaryClickedCoords.value ??
      getCenterLatLng()

  if (!coords) {
    return
  }

  const [lat, lng] =
      coords

  selectedToiletCoords.value = [
    lat,
    lng
  ]

  clearTemporaryCoords()

  isPickingToiletMode.value =
      false

  isAddFormOpen.value =
      true
}

const handleFormSubmit = async (
    formData: any
) => {
  try {
    await toiletService.addToilet(
        formData
    )

    isAddFormOpen.value =
        false

    toast.success(
        'Дякуємо! Вбиральню успішно надіслано на перевірку модераторам.',
        {
          timeout: 5000
        }
    )
  } catch (error: any) {
    toast.error(
        'Сталася помилка під час збереження.'
    )
  }
}

// ==========================================================
// CANCELLATION HANDLERS
// ==========================================================

const cancelManualLocation = () => {
  clearTemporaryCoords()
  isManualSelectionMode.value = false
}

const cancelToiletLocation = () => {
  clearTemporaryCoords()
  isPickingToiletMode.value = false
}

// ==========================================================
// ADDRESS SEARCH
// ==========================================================

const startAddressSearchForUser = () => {
  showLocationPrompt.value =
      false

  addressSearchContext.value =
      'user'

  isAddressSearchOpen.value =
      true
}

const handleAddressSearchForToilet = () => {
  addressSearchContext.value =
      'toilet'

  isAddressSearchOpen.value =
      true
}

const handleAddressSelected = (
    result: {
      display_name: string
      lat: number
      lng: number
    }
) => {
  isAddressSearchOpen.value =
      false

  /**
   * Якщо користувач був у manual mode,
   * пошук адреси завершує цей режим.
   */
  if (
      addressSearchContext.value ===
      'user'
  ) {
    isManualSelectionMode.value =
        false

    clearTemporaryCoords()
  }

  flyToCoords(
      result.lng,
      result.lat,
      17
  )

  if (
      addressSearchContext.value ===
      'user'
  ) {
    userLocation.value = [
      result.lat,
      result.lng
    ]
  }
}

// ==========================================================
// ROUTE CHOICE
// ==========================================================

const openRouteChoice = (
    toilet: Toilet
) => {
  targetToiletForRoute.value =
      toilet

  showRouteChoiceModal.value =
      true
}

const handleGoogleRoute = () => {
  showRouteChoiceModal.value =
      false

  if (
      !targetToiletForRoute.value ||
      targetToiletForRoute.value.latitude ==
      null ||
      targetToiletForRoute.value.longitude ==
      null
  ) {
    toast.error(
        'У цієї локації відсутні координати'
    )

    return
  }

  const {
    latitude,
    longitude
  } = targetToiletForRoute.value

  window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`,
      '_blank'
  )
}

// ==========================================================
// INTERNAL ROUTING
// ==========================================================

const getTargetRouteCoords =
    (): [number, number] | null => {
      if (
          !targetToiletForRoute.value ||
          targetToiletForRoute.value.latitude ==
          null ||
          targetToiletForRoute.value.longitude ==
          null
      ) {
        return null
      }

      return [
        targetToiletForRoute.value.latitude,
        targetToiletForRoute.value.longitude
      ]
    }

const requestRoute = async (
    start: [number, number],
    shouldFitBounds = false
): Promise<boolean | null> => {
  const target =
      getTargetRouteCoords()

  if (!target) {
    return false
  }

  if (isRouting.value) {
    pendingRouteLocation.value =
        start

    return null
  }

  isRouting.value =
      true

  try {
    const success =
        await buildRoute(
            start,
            target
        )

    if (
        success &&
        activeRouteCoords.value
    ) {
      lastRoutedLocation.value =
          start

      if (shouldFitBounds) {
        fitRouteBounds(
            activeRouteCoords.value
        )
      }

      return true
    }

    return false
  } finally {
    isRouting.value =
        false

    const pending =
        pendingRouteLocation.value

    pendingRouteLocation.value =
        null

    if (
        pending &&
        lastRoutedLocation.value &&
        getDistanceMeters(
            pending,
            lastRoutedLocation.value
        ) >=
        ROUTE_REBUILD_DISTANCE
    ) {
      void requestRoute(
          pending,
          false
      )
    }
  }
}

const handleInternalRoute =
    async () => {
      showRouteChoiceModal.value =
          false

      if (
          !targetToiletForRoute.value
      ) {
        return
      }

      if (!userLocation.value) {
        toast.info(
            'Увімкніть геолокацію, щоб ми знали, звідки прокладати маршрут.',
            {
              timeout: 5000
            }
        )

        return
      }

      const result =
          await requestRoute(
              userLocation.value,
              true
          )

      if (result === false) {
        toast.warning(
            'Не вдалося прокласти пішохідний маршрут. Спробуйте Google Maps.',
            {
              timeout: 5000
            }
        )
      }
    }

// ==========================================================
// WELCOME
// ==========================================================

const handleWelcomeClose = (
    dontShowAgain: boolean
) => {
  if (dontShowAgain) {
    localStorage.setItem(
        'hideAlphaWelcome',
        'true'
    )
  }

  showWelcomeModal.value =
      false
}

// ==========================================================
// ADMIN TELEPORT
// ==========================================================

const handleTeleportFromAdmin =
    async (
        id: string,
        lat: number,
        lng: number
    ) => {
      currentScreen.value =
          'map'

      await nextTick()

      setTimeout(() => {
        if (!map.value) {
          return
        }

        map.value.resize()

        if (pendingReviewMarker) {
          pendingReviewMarker.remove()
        }

        const el =
            document.createElement(
                'div'
            )

        el.className =
            'relative flex flex-col items-center justify-end w-12 h-16 cursor-pointer'

        el.innerHTML = `
          <div class="flex items-center justify-center w-10 h-10 bg-amber-500 text-white rounded-full shadow-[0_0_15px_rgba(245,158,11,0.6)] border-2 border-white animate-bounce relative z-50">
            <span class="material-symbols-outlined text-[24px]">
              location_on
            </span>
          </div>

          <div class="absolute bottom-1 left-1/2 -translate-x-1/2 w-5 h-1.5 bg-black/40 rounded-[100%] blur-[1px]"></div>
        `

        const popupNode =
            document.createElement(
                'div'
            )

        popupNode.className =
            'p-3 flex flex-col items-center min-w-[220px] font-sans gap-2'

        popupNode.innerHTML = `
          <span class="text-[10px] font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-100 uppercase tracking-wider mb-1">
            На перевірці
          </span>

          <button
            id="route-btn"
            class="w-full flex items-center justify-center gap-1.5 bg-indigo-600 text-white text-xs font-bold py-2 rounded-lg hover:bg-indigo-700 active:scale-95 transition-all shadow-sm"
          >
            <span class="material-symbols-outlined text-[16px]">
              directions_walk
            </span>
            Маршрут сюди
          </button>

          <button
            id="return-admin-btn"
            class="w-full flex items-center justify-center gap-1.5 bg-slate-100 text-slate-700 text-xs font-bold py-2 rounded-lg hover:bg-slate-200 active:scale-95 transition-all border border-slate-200"
          >
            <span class="material-symbols-outlined text-[16px]">
              admin_panel_settings
            </span>
            Повернутися до заявки
          </button>
        `

        const btnRoute =
            popupNode.querySelector(
                '#route-btn'
            )

        btnRoute?.addEventListener(
            'click',
            () => {
              targetToiletForRoute.value = {
                latitude: lat,
                longitude: lng
              }

              showRouteChoiceModal.value =
                  true
            }
        )

        const btnReturn =
            popupNode.querySelector(
                '#return-admin-btn'
            )

        btnReturn?.addEventListener(
            'click',
            () => {
              adminFocusToiletId.value =
                  id

              currentScreen.value =
                  'admin'
            }
        )

        const popup =
            new maplibregl.Popup({
              closeButton: true,
              closeOnClick: true,
              anchor: 'bottom',
              offset: 45
            })
                .setDOMContent(
                    popupNode
                )

        pendingReviewMarker =
            new maplibregl.Marker({
              element: el,
              anchor: 'bottom'
            })
                .setLngLat([
                  lng,
                  lat
                ])
                .setPopup(popup)
                .addTo(
                    map.value as any
                )

        pendingReviewMarker.togglePopup()

        flyToCoords(
            lng,
            lat,
            18
        )
      }, 50)
    }

// ==========================================================
// ADMIN MAP ACTIONS
// ==========================================================

const handleAdminEdit = (
    toilet: Toilet
) => {
  closeActivePopup()

  toiletToEdit.value =
      toilet

  isEditModalOpen.value =
      true
}

const handleAdminMove = (
    toilet: Toilet
) => {
  if (
      toilet.longitude == null ||
      toilet.latitude == null
  ) {
    toast.error(
        'У цієї локації відсутні координати'
    )

    return
  }

  closeActivePopup()

  isRelocatingMode.value =
      true

  relocatingToiletId.value =
      toilet.id

  flyToCoords(
      toilet.longitude,
      toilet.latitude,
      17
  )
}

const handleAdminDelete =
    async (
        toiletId: string
    ) => {
      if (
          !confirm(
              'Ви впевнені, що хочете видалити цей туалет назавжди?'
          )
      ) {
        return
      }

      try {
        await toiletService.deleteToilet(
            toiletId,
            []
        )

        closeActivePopup()

        await refreshMapData()

        toast.success(
            'Локацію успішно видалено'
        )
      } catch (error) {
        console.error(error)

        toast.error(
            'Помилка при видаленні'
        )
      }
    }

const handleMapEditSaved = () => {
  isEditModalOpen.value =
      false

  refreshMapData()
}

const confirmRelocating =
    async () => {
      if (
          !relocatingToiletId.value
      ) {
        return
      }

      const [
        lng,
        lat
      ] = center.value

      try {
        await toiletService.updateToiletCoordinates(
            relocatingToiletId.value,
            lat,
            lng
        )

        toast.success(
            'Локацію успішно оновлено'
        )

        await refreshMapData()
      } catch (error) {
        toast.error(
            'Помилка при збереженні нових координат'
        )
      } finally {
        cancelRelocating()
      }
    }

const cancelRelocating = () => {
  isRelocatingMode.value =
      false

  relocatingToiletId.value =
      null
}

// ==========================================================
// WATCHERS
// ==========================================================

// ----------------------------------------------------------
// TOILETS
// ----------------------------------------------------------

watch(
    [approvedToilets, map],
    ([newToilets, mapInstance]) => {
      if (
          !mapInstance ||
          !newToilets.length
      ) {
        return
      }

      updateToiletsClustered(
          newToilets,
          selectToiletById
      )
    },
    {
      immediate: true
    }
)

// ==========================================================
// USER LOCATION
// ==========================================================

watch(
    userLocation,
    async newLoc => {
      if (
          !map.value ||
          !newLoc
      ) {
        return
      }

      const [
        lat,
        lng
      ] = newLoc

      // ------------------------------------------------------
      // USER MARKER
      // ------------------------------------------------------

      if (userLocationMarker) {
        userLocationMarker.setLngLat([
          lng,
          lat
        ])
      } else {
        const el =
            document.createElement(
                'div'
            )

        el.className =
            'relative flex items-center justify-center w-6 h-6'

        el.innerHTML = `
          <span class="absolute inline-flex w-full h-full rounded-full bg-indigo-400 opacity-75 animate-ping"></span>
          <span class="relative inline-flex w-4 h-4 rounded-full bg-indigo-600 border-2 border-white shadow-md"></span>
        `

        userLocationMarker =
            new maplibregl.Marker({
              element: el
            })
                .setLngLat([
                  lng,
                  lat
                ])
                .addTo(
                    map.value as any
                )
      }

      // ------------------------------------------------------
      // FOLLOW USER
      // ------------------------------------------------------

      if (
          isFollowUserActive.value
      ) {
        flyToCoords(
            lng,
            lat,
            16
        )
      }

      // ------------------------------------------------------
      // AUTO ROUTING
      // ------------------------------------------------------

      if (
          !targetToiletForRoute.value ||
          !activeRouteCoords.value?.length
      ) {
        return
      }

      const currentLocation:
          [number, number] = [
        lat,
        lng
      ]

      if (
          !lastRoutedLocation.value
      ) {
        lastRoutedLocation.value =
            currentLocation

        return
      }

      const distanceSinceLastRoute =
          getDistanceMeters(
              currentLocation,
              lastRoutedLocation.value
          )

      if (
          distanceSinceLastRoute <
          ROUTE_REBUILD_DISTANCE
      ) {
        return
      }

      if (isRouting.value) {
        pendingRouteLocation.value =
            currentLocation

        return
      }

      await requestRoute(
          currentLocation,
          false
      )
    }
)

// ==========================================================
// ROUTE GEOJSON
// ==========================================================

watch(
    activeRouteCoords,
    coords => {
      if (!map.value) {
        return
      }

      if (
          !coords ||
          coords.length === 0
      ) {
        if (
            map.value.getLayer(
                'route'
            )
        ) {
          map.value.removeLayer(
              'route'
          )
        }

        if (
            map.value.getSource(
                'route'
            )
        ) {
          map.value.removeSource(
              'route'
          )
        }

        return
      }

      const geojson = {
        type: 'Feature' as const,

        properties: {},

        geometry: {
          type: 'LineString' as const,

          coordinates:
              coords.map(
                  ([lat, lng]) => [
                    lng,
                    lat
                  ]
              )
        }
      }

      if (
          map.value.getSource(
              'route'
          )
      ) {
        (
            map.value.getSource(
                'route'
            ) as
                maplibregl.GeoJSONSource
        ).setData(
            geojson
        )

        return
      }

      map.value.addSource(
          'route',
          {
            type: 'geojson',
            data: geojson
          }
      )

      map.value.addLayer({
        id: 'route',

        type: 'line',

        source: 'route',

        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },

        paint: {
          'line-color':
              '#4f46e5',

          'line-width': 5,

          'line-opacity': 0.8,

          'line-dasharray': [
            2,
            2
          ]
        }
      })
    }
)

// ==========================================================
// SCREEN
// ==========================================================

watch(
    currentScreen,
    async newScreen => {
      if (
          newScreen === 'map'
      ) {
        await nextTick()

        setTimeout(() => {
          if (map.value) {
            map.value.resize()
          }
        }, 50)

        return
      }

      if (pendingReviewMarker) {
        pendingReviewMarker.remove()
        pendingReviewMarker = null
      }

      closeActivePopup()
    }
)

// ==========================================================
// MOUNT
// ==========================================================

onMounted(async () => {
  if (
      localStorage.getItem(
          'hideAlphaWelcome'
      ) !== 'true'
  ) {
    showWelcomeModal.value =
        true
  }

  window.addEventListener(
      'resize',
      handleResize
  )

  await initAuth(
      currentScreen
  )

  const mapInstance =
      initMap(
          'main-map',

          () => {
            if (
                isFollowUserActive.value
            ) {
              stopTrackingLocation()

              isFollowUserActive.value =
                  false
            }
          }
      )

  // ========================================================
  // MANUAL / TOILET TARGETING
  // ========================================================

  mapInstance.on(
      'moveend',
      () => {
        if (
            isManualSelectionMode.value ||
            isPickingToiletMode.value
        ) {
          syncTemporaryCoordsWithCenter()
        }
      }
  )

  mapInstance.on('click', (e) => {
    // Реагуємо на клік ТІЛЬКИ якщо ми в режимі вибору місця для НОВОГО ТУАЛЕТУ
    if (isPickingToiletMode.value) {
      temporaryClickedCoords.value = [e.lngLat.lat, e.lngLat.lng]
      flyToCoords(e.lngLat.lng, e.lngLat.lat, mapInstance.getZoom())
    }
  })

  await loadToiletsData()

  initRealtime()
})

// ==========================================================
// UNMOUNT
// ==========================================================

onUnmounted(() => {
  window.removeEventListener(
      'resize',
      handleResize
  )

  stopTrackingLocation()

  clearTemporaryCoords()

  if (userLocationMarker) {
    userLocationMarker.remove()
    userLocationMarker = null
  }

  if (pendingReviewMarker) {
    pendingReviewMarker.remove()
    pendingReviewMarker = null
  }

  if (activeMapPopup) {
    activeMapPopup.remove()
    activeMapPopup = null
  }
})
</script>

<template>
  <main
      class="relative w-screen h-dvh overflow-hidden bg-slate-100 font-sans"
  >
    <!-- СИСТЕМНИЙ ХЕДЕР -->
    <AppNavigation
        :current-screen="currentScreen"
        :is-admin="isAdmin"
        @navigate="navigateTo"
        @logout="onLogout"
    />

    <!-- MAP -->
    <div
        v-show="currentScreen === 'map'"
        class="absolute inset-0 w-full h-full"
    >
      <!-- MapLibre -->
      <div
          id="main-map"
          class="absolute inset-0 w-full h-full z-0"
      ></div>

      <!-- MODALS -->

      <WelcomeModal
          :is-open="showWelcomeModal"
          @close="handleWelcomeClose"
      />

      <LocationPrompt
          :is-open="showLocationPrompt"
          @use-gps="handleGpsLocation"
          @use-manual="handleManualLocation"
          @use-address="startAddressSearchForUser"
          @close="showLocationPrompt = false"
      />

      <AddToiletForm
          :is-open="isAddFormOpen"
          :coords="selectedToiletCoords"
          @close="isAddFormOpen = false"
          @submit="handleFormSubmit"
      />

      <AddressSearchModal
          :is-open="isAddressSearchOpen"
          @close="isAddressSearchOpen = false"
          @select="handleAddressSelected"
      />

      <RouteChoiceModal
          :is-open="showRouteChoiceModal"
          @use-google="handleGoogleRoute"
          @use-internal="handleInternalRoute"
          @close="showRouteChoiceModal = false"
      />

      <RouteInfoBanner
          :info="routeInfo"
          @close="
          clearRoute();
          targetToiletForRoute = null;
          lastRoutedLocation = null;
          pendingRouteLocation = null;
        "
      />

      <!-- EDIT MODAL -->

      <EditToiletModal
          :is-open="isEditModalOpen"
          :toilet="toiletToEdit"
          @close="isEditModalOpen = false"
          @saved="handleMapEditSaved"
      />

      <!-- UPDATE MAP -->

      <transition
          enter-active-class="transition duration-300 ease-out"
          enter-from-class="transform -translate-y-10 opacity-0"
          enter-to-class="transform translate-y-0 opacity-100"
          leave-active-class="transition duration-200 ease-in"
          leave-from-class="transform translate-y-0 opacity-100"
          leave-to-class="transform -translate-y-10 opacity-0"
      >
        <div
            v-if="hasNewData"
            class="absolute top-24 left-1/2 -translate-x-1/2 z-60"
        >
          <button
              @click="refreshMapData"
              class="flex items-center gap-2 px-5 py-2.5 bg-white text-indigo-600 font-bold text-sm rounded-full shadow-lg border border-slate-100 hover:bg-slate-50 active:scale-95 transition-all cursor-pointer"
          >
            <span
                class="material-symbols-outlined text-[18px] animate-spin-slow"
            >
              sync
            </span>

            Оновити мапу
          </button>
        </div>
      </transition>

      <!-- DESKTOP POPUP -->

      <div class="hidden">
        <div ref="popupContentRef">
          <ToiletPopupCard
              v-if="
              activeToiletForPopup &&
              isDesktop
            "
              :toilet="activeToiletForPopup"
              :is-admin="isAdmin"
              @build-route="handlePopupRoute"
              @edit="handleAdminEdit"
              @move="handleAdminMove"
              @delete="handleAdminDelete"
          />
        </div>
      </div>

      <!-- MOBILE BOTTOM SHEET -->

      <ToiletBottomSheet
          v-if="
          activeToiletForPopup &&
          !isDesktop
        "
          :toilet="activeToiletForPopup"
          :is-admin="isAdmin"
          @close="closeActivePopup"
          @build-route="handlePopupRoute"
          @edit="handleAdminEdit"
          @move="handleAdminMove"
          @delete="handleAdminDelete"
      />

      <!-- MAP OVERLAYS -->

      <UserTargetingOverlay
          :is-active="isManualSelectionMode"
          @confirm="confirmManualLocation"
          @cancel="cancelManualLocation"
      />

      <ToiletTargetingOverlay
          :is-active="isPickingToiletMode"
          @snap-gps="snapToiletToUserGps"
          @search="handleAddressSearchForToilet"
          @confirm="confirmToiletLocation"
          @cancel="cancelToiletLocation"
      />

      <RelocateOverlay
          :is-active="isRelocatingMode"
          @confirm="confirmRelocating"
          @cancel="cancelRelocating"
      />

      <MapControls
          v-show="
          !isManualSelectionMode &&
          !isPickingToiletMode &&
          !(
            activeToiletForPopup &&
            !isDesktop
          )
        "
          :is-locating="
            isLocating ||
            isRouting
          "
          @locate="showLocationPrompt = true"
          @add="startPickingToiletLocation"
          @zoom-in="
            map?.zoomIn({
              duration: 300
            })
          "
          @zoom-out="
            map?.zoomOut({
              duration: 300
            })
          "
          @compass="
            map?.resetNorthPitch({
              duration: 500
            })
          "
      />
    </div>

    <!-- LOGIN -->

    <LoginView
        v-if="
        currentScreen === 'login'
      "
        class="absolute inset-0 z-50 bg-slate-50"
        @close="
          currentScreen = 'map'
        "
    />

    <!-- ADMIN -->

    <AdminView
        v-if="
        currentScreen === 'admin' &&
        isAdmin
      "
        class="absolute inset-0 z-50 bg-slate-50"
        :focus-id="adminFocusToiletId"
        @logout="onLogout"
        @teleport="handleTeleportFromAdmin"
    />
  </main>
</template>

<style scoped>
/* Додаткові CSS стилі при потребі */
</style>