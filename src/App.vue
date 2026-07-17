<script setup lang="ts">
import {ref, watch, onMounted, defineAsyncComponent, onUnmounted} from 'vue'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

// СЕРВІСИ ТА КОМПОЗИЦІЙНІ ФУНКЦІЇ
import { toiletService } from './services/toiletService'
import { useGeolocation } from './composables/useGeolocation'
import { useRouting } from './composables/useRouting'
import { useMap } from './composables/useMap' // <-- НАШ НОВИЙ COMPOSABLE
import { useToast } from "vue-toastification"
import { supabase } from "./supabase"

// БАЗОВІ КОМПОНЕНТИ КАРТИ
import MapControls from './components/map/MapControls.vue'
import ToiletTargetingOverlay from "./components/map/ToiletTargetingOverlay.vue"
import UserTargetingOverlay from "./components/map/UserTargetingOverlay.vue"
import RouteInfoBanner from "./components/map/RouteInfoBanner.vue"
import ToiletPopupCard from "./components/map/ToiletPopupCard.vue"

// ЛІНИВІ КОМПОНЕНТИ ТА ВІКНА
const LocationPrompt = defineAsyncComponent(() => import('./components/features/LocationPrompt.vue'))
const AddToiletForm = defineAsyncComponent(() => import('./components/features/AddToiletForm.vue'))
const AddressSearchModal = defineAsyncComponent(() => import('./components/features/AddressSearchModal.vue'))
const WelcomeModal = defineAsyncComponent(() => import('./components/features/WelcomeModal.vue'))
const RouteChoiceModal = defineAsyncComponent(() => import('./components/features/RouteChoiceModal.vue'))

// Ініціалізація композиційних функцій
const { userLocation, isLocating, startTrackingLocation, stopTrackingLocation } = useGeolocation()
const { activeRouteCoords, routeInfo, buildRoute, clearRoute } = useRouting()
const {
  map,
  temporaryClickedCoords,
  initMap,
  flyToCoords,
  fitRouteBounds,
  updateToiletsClustered
} = useMap()

// Маркер користувача (локальний для App.vue, щоб не перевантажувати глобальний стан)
let userLocationMarker: maplibregl.Marker | null = null

// СТАН КАРТИ ТА МОДАЛОК
const isFollowUserActive = ref(false)
const approvedToilets = ref<any[]>([])
const showWelcomeModal = ref(false)
const showLocationPrompt = ref(false)
const showRouteChoiceModal = ref(false)
const targetToiletForRoute = ref<any>(null)
const isAddressSearchOpen = ref(false)
const isAddFormOpen = ref(false)

// СТАН РЕЖИМІВ КАРТИ
const isManualSelectionMode = ref(false)
const isPickingToiletMode = ref(false)
const selectedToiletCoords = ref<[number, number] | null>(null)
const addressSearchContext = ref<'user' | 'toilet'>('user')

// СТАН ОНОВЛЕННЯ ДАНИХ
const toast = useToast()
const hasNewData = ref(false)

// Попапи
const popupContentRef = ref<HTMLElement | null>(null)
const activeToiletForPopup = ref<any>(null)
let activeMapPopup: maplibregl.Popup | null = null

// ЗАВАНТАЖЕННЯ ДАНИХ
const loadToiletsData = async () => {
  try {
    const data = await toiletService.fetchApprovedToilets()
    if (data) approvedToilets.value = data
  } catch (error) {
    console.error('Помилка завантаження точок:', error)
  }
}

const refreshMapData = async () => {
  toast.info('Оновлюємо карту...', { timeout: 1500 })
  await loadToiletsData()
  hasNewData.value = false
  toast.success('Карта успішно оновлена!')
}

// ЖИТТЄВИЙ ЦИКЛ (Ініціалізація карти)
// 1. Оголошуємо змінну каналу на рівні компонента (не всередині функцій)
let toiletsChannel: any = null

// 2. Виносимо onUnmounted на рівень компонента
onUnmounted(() => {
  if (toiletsChannel) {
    supabase.removeChannel(toiletsChannel)
  }
})

// 3. Твій чистий onMounted
onMounted(() => {
  const isWelcomeHidden = localStorage.getItem('hideAlphaWelcome')
  if (isWelcomeHidden !== 'true') {
    showWelcomeModal.value = true
  }

  // Створюємо карту через composable
  const mapInstance = initMap('main-map', () => {
    if (isFollowUserActive.value) {
      stopTrackingLocation()
      isFollowUserActive.value = false
    }
  })

  // Слухаємо кліки на карті для мануального вибору
  mapInstance.on('click', (e) => {
    if (isManualSelectionMode.value || isPickingToiletMode.value) {
      const { lng, lat } = e.lngLat
      temporaryClickedCoords.value = [lat, lng]
      flyToCoords(lng, lat, mapInstance.getZoom())
    }
  })

  loadToiletsData()

  // 4. Функція підписки з об'єднаною логікою (без дублікатів каналу)
  const subscribeToToiletsRealtime = () => {
    if (toiletsChannel) {
      supabase.removeChannel(toiletsChannel)
    }

    toiletsChannel = supabase
        .channel('public:toilets')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'toilets' }, // Виправлено помилку друку: schema замість scheme
            (payload) => {
              console.log('Change received!', payload)

              let shouldAlert = false
              if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                const newData = payload.new as { status?: string } | null
                if (newData && newData.status === 'approved') shouldAlert = true
              }
              if (payload.eventType === 'DELETE') shouldAlert = true

              if (shouldAlert && !hasNewData.value) {
                hasNewData.value = true
                toast.warning('Карту було оновлено іншим користувачем! Оновіть сторінку.')
              }
            }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('Successfully subscribed to realtime toilets!')
          }
        })
  }

  // Запуск єдиної підписки
  subscribeToToiletsRealtime()
})

// WATCHERS

// Відображення кластеризованих туалетів
watch([approvedToilets, map], ([newToilets, mapInstance]) => {
  if (!mapInstance || !newToilets.length) return
  updateToiletsClustered(newToilets, selectToiletById)
}, { immediate: true })

// Переміщення користувача та автоперерахунок маршруту
watch(userLocation, async (newLoc) => {
  if (!map.value || !newLoc) return

  const [lat, lng] = newLoc

  if (userLocationMarker) {
    userLocationMarker.setLngLat([lng, lat])
  } else {
    const el = document.createElement('div')
    el.className = 'relative flex items-center justify-center w-6 h-6'
    el.innerHTML = `
      <span class="absolute inline-flex w-full h-full rounded-full bg-indigo-400 opacity-75 animate-ping"></span>
      <span class="relative inline-flex w-4 h-4 rounded-full bg-indigo-600 border-2 border-white shadow-md"></span>
    `
    userLocationMarker = new maplibregl.Marker({ element: el })
        .setLngLat([lng, lat])
        .addTo(map.value as any)
  }

  // Автоперебудова маршруту при русі
  if (targetToiletForRoute.value && (activeRouteCoords.value?.length ?? 0) > 0) {
    const endCoords: [number, number] = [
      targetToiletForRoute.value.latitude,
      targetToiletForRoute.value.longitude
    ]
    await buildRoute(newLoc, endCoords)
  }

  if (!isFollowUserActive.value) {
    flyToCoords(lng, lat, 16)
  }
})

// Рендеринг лінії маршруту на карті
watch(activeRouteCoords, (coords) => {
  if (!map.value) return

  if (!coords || coords.length === 0) {
    if (map.value.getLayer('route')) map.value.removeLayer('route')
    if (map.value.getSource('route')) map.value.removeSource('route')
    return
  }

  const lngLatCoords = coords.map(pair => [pair[1], pair[0]])
  const geojson: any = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: lngLatCoords
    }
  }

  if (map.value.getSource('route')) {
    (map.value.getSource('route') as maplibregl.GeoJSONSource).setData(geojson)
  } else {
    map.value.addSource('route', { type: 'geojson', data: geojson })
    map.value.addLayer({
      id: 'route',
      type: 'line',
      source: 'route',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#4f46e5',
        'line-width': 5,
        'line-opacity': 0.8,
        'line-dasharray': [2, 2]
      }
    })
  }
})

const selectToiletById = (id: number) => {
  if (!map.value) return

  // Знаходимо об'єкт туалету за ID
  const toilet = approvedToilets.value.find(t => t.id === id)
  if (!toilet) return

  activeToiletForPopup.value = toilet

  // Закриваємо попередній попап, якщо він є
  if (activeMapPopup) activeMapPopup.remove()

  // Відкриваємо кастомний попап
  import('vue').then(({ nextTick }) => {
    nextTick(() => {
      if (!popupContentRef.value) return

      activeMapPopup = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: true,
        offset: 20,
        maxWidth: '320px'
      })
          .setDOMContent(popupContentRef.value!)
          .setLngLat([toilet.longitude, toilet.latitude])
          .addTo(map.value as any)

      map.value!.flyTo({
        center: [toilet.longitude, toilet.latitude],
        zoom: Math.max(map.value!.getZoom(), 15),
        speed: 1.2
      })
    })
  })
}

// ФУНКЦІОНАЛЬНА ЛОГІКА UI
const handleWelcomeClose = (dontShowAgain: boolean) => {
  if (dontShowAgain) localStorage.setItem('hideAlphaWelcome', 'true')
  showWelcomeModal.value = false
}

const handlePopupRoute = () => {
  if (activeMapPopup) activeMapPopup.remove()
  if (activeToiletForPopup.value) openRouteChoice(activeToiletForPopup.value)
}

const handleGpsLocation = () => {
  showLocationPrompt.value = false

  if (isFollowUserActive.value) {
    stopTrackingLocation()
    isFollowUserActive.value = false
  } else {
    isFollowUserActive.value = true
    startTrackingLocation((lat, lng) => {
      flyToCoords(lng, lat, 16)
    }, () => {
      isFollowUserActive.value = false
    })
  }
}

const handleManualLocation = () => {
  showLocationPrompt.value = false
  if (isFollowUserActive.value) {
    stopTrackingLocation()
    isFollowUserActive.value = false
  }
  isManualSelectionMode.value = true
}

const confirmManualLocation = () => {
  if (!map.value) return

  let lat: number, lng: number
  if (temporaryClickedCoords.value) {
    [lat, lng] = temporaryClickedCoords.value
  } else {
    const centerCoords = map.value.getCenter()
    lng = centerCoords.lng
    lat = centerCoords.lat
  }

  userLocation.value = [lat, lng]
  temporaryClickedCoords.value = null
  isManualSelectionMode.value = false
}

const startPickingToiletLocation = () => {
  isPickingToiletMode.value = true
}

const snapToiletToUserGps = () => {
  startTrackingLocation((lat, lng) => {
    flyToCoords(lng, lat, 18)
    stopTrackingLocation()
  })
}

const confirmToiletLocation = () => {
  if (!map.value) return

  let lat: number, lng: number
  if (temporaryClickedCoords.value) {
    [lat, lng] = temporaryClickedCoords.value
  } else {
    const centerCoords = map.value.getCenter()
    lng = centerCoords.lng
    lat = centerCoords.lat
  }

  selectedToiletCoords.value = [lat, lng]
  temporaryClickedCoords.value = null
  isPickingToiletMode.value = false
  isAddFormOpen.value = true
}

const handleFormSubmit = async (formData: any) => {
  try {
    await toiletService.addToilet(formData)
    isAddFormOpen.value = false
    toast.success('Дякуємо! Вбиральню успішно надіслано на перевірку модераторам.', { timeout: 5000 })
  } catch (error: any) {
    console.error('Помилка відправки в базу:', error.message)
    toast.error('Сталася помилка під час збереження.')
  }
}

const startAddressSearchForUser = () => {
  showLocationPrompt.value = false
  addressSearchContext.value = 'user'
  isAddressSearchOpen.value = true
}

const handleAddressSearchForToilet = () => {
  addressSearchContext.value = 'toilet'
  isAddressSearchOpen.value = true
}

const handleAddressSelected = (result: { display_name: string; lat: number; lng: number }) => {
  isAddressSearchOpen.value = false
  flyToCoords(result.lng, result.lat, 17)

  if (addressSearchContext.value === 'user') {
    userLocation.value = [result.lat, result.lng]
  }
}

const openRouteChoice = (toilet: any) => {
  targetToiletForRoute.value = toilet
  showRouteChoiceModal.value = true
}

const handleGoogleRoute = () => {
  showRouteChoiceModal.value = false
  if (!targetToiletForRoute.value) return
  const { latitude, longitude } = targetToiletForRoute.value
  const url = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`
  window.open(url, '_blank')
}

const handleInternalRoute = async () => {
  showRouteChoiceModal.value = false
  if (!targetToiletForRoute.value) return

  if (!userLocation.value) {
    toast.info('Увімкніть геолокацію, щоб ми знали, звідки прокладати маршрут.', { timeout: 5000 })
    return
  }

  const toilet = targetToiletForRoute.value
  const endCoords: [number, number] = [toilet.latitude, toilet.longitude]

  isLocating.value = true
  const success = await buildRoute(userLocation.value, endCoords)

  if (success && activeRouteCoords.value) {
    fitRouteBounds(activeRouteCoords.value)
  }
  isLocating.value = false
}

const handleClearRoute = () => {
  clearRoute()
  targetToiletForRoute.value = null
}
</script>

<template>
  <main class="relative w-screen h-dvh overflow-hidden bg-slate-100">

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

    <RouteInfoBanner :info="routeInfo" @close="handleClearRoute" />

    <transition
        enter-active-class="transition duration-300 ease-out"
        enter-from-class="transform -translate-y-10 opacity-0"
        enter-to-class="transform translate-y-0 opacity-100"
        leave-active-class="transition duration-200 ease-in"
        leave-from-class="transform translate-y-0 opacity-100"
        leave-to-class="transform -translate-y-10 opacity-0"
    >
      <div v-if="hasNewData" class="absolute top-24 left-1/2 -translate-x-1/2 z-1000">
        <button
            @click="refreshMapData"
            class="flex items-center gap-2 px-5 py-2.5 bg-white text-indigo-600 font-bold text-sm rounded-full shadow-lg border border-slate-100 hover:bg-slate-50 active:scale-95 transition-all"
        >
          <span class="material-symbols-outlined text-[18px] animate-spin-slow">sync</span>
          Оновити карту
        </button>
      </div>
    </transition>

    <div class="hidden">
      <div ref="popupContentRef" class="w-full">
        <ToiletPopupCard
            v-if="activeToiletForPopup"
            :toilet="activeToiletForPopup"
            @build-route="handlePopupRoute"
        />
      </div>
    </div>
    <div id="main-map" class="absolute top-0 left-0 w-full h-full z-0" style="min-height: 100vh; min-width: 100vw;"></div>

    <UserTargetingOverlay
        :is-active="isManualSelectionMode"
        @confirm="confirmManualLocation"
    />

    <ToiletTargetingOverlay
        :is-active="isPickingToiletMode"
        @snap-gps="snapToiletToUserGps"
        @search="handleAddressSearchForToilet"
        @confirm="confirmToiletLocation"
        @cancel="isPickingToiletMode = false"
    />

    <MapControls
        v-show="!isManualSelectionMode && !isPickingToiletMode"
        :is-locating="isLocating"
        @locate="showLocationPrompt = true"
        @add="startPickingToiletLocation"
        @zoom-in="map?.zoomIn({ duration: 300 })"
        @zoom-out="map?.zoomOut({ duration: 300 })"
        @compass="map?.resetNorthPitch({ duration: 500 })"
    />

  </main>
</template>