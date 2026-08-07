<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, defineAsyncComponent, nextTick } from 'vue'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

// --- СЕРВІСИ ТА КОМПОЗИЦІЙНІ ФУНКЦІЇ ---
import { toiletService } from './services/toiletService'
import { useGeolocation } from './composables/useGeolocation'
import { useRouting } from './composables/useRouting'
import { useMap } from './composables/useMap'
import { useAuth } from './composables/useAuth'
import { useRealtimeToilets } from './composables/useRealtimeToilets'
import { useToast } from "vue-toastification"

// --- БАЗОВІ КОМПОНЕНТИ ---
import AppNavigation from './components/ui/AppNavigation.vue'
import MapControls from './components/map/MapControls.vue'
import ToiletTargetingOverlay from "./components/map/ToiletTargetingOverlay.vue"
import UserTargetingOverlay from "./components/map/UserTargetingOverlay.vue"
import RouteInfoBanner from "./components/map/RouteInfoBanner.vue"
import ToiletPopupCard from "./components/map/ToiletPopupCard.vue"     // 🖥️ Десктоп: компактна картка в maplibregl.Popup
import ToiletBottomSheet from "./components/map/ToiletBottomSheet.vue" // 📱 Мобільні: bottom sheet
import AdminView from "./components/views/AdminView.vue"
import LoginView from "./components/views/LoginView.vue"
import EditToiletModal from "./components/features/EditToiletModal.vue"
import RelocateOverlay from "./components/map/RelocateOverlay.vue"
import type { Toilet } from "./types.ts"

// --- ЛІНИВІ КОМПОНЕНТИ ---
const LocationPrompt = defineAsyncComponent(() => import('./components/features/LocationPrompt.vue'))
const AddToiletForm = defineAsyncComponent(() => import('./components/features/AddToiletForm.vue'))
const AddressSearchModal = defineAsyncComponent(() => import('./components/features/AddressSearchModal.vue'))
const WelcomeModal = defineAsyncComponent(() => import('./components/features/WelcomeModal.vue'))
const RouteChoiceModal = defineAsyncComponent(() => import('./components/features/RouteChoiceModal.vue'))

// --- СТАН ДОДАТКУ ---
const currentScreen = ref<'map' | 'login' | 'admin'>('map')
const adminFocusToiletId = ref<string | null>(null)

// --- ІНІЦІАЛІЗАЦІЯ ХУКІВ ---
const { isAdmin, initAuth, handleLogout } = useAuth()
const { approvedToilets, hasNewData, refreshMapData, initRealtime, loadToiletsData } = useRealtimeToilets()
const { userLocation, isLocating, startTrackingLocation, stopTrackingLocation } = useGeolocation()
const { activeRouteCoords, routeInfo, buildRoute, clearRoute } = useRouting()
const { map, center, temporaryClickedCoords, initMap, flyToCoords, fitRouteBounds, updateToiletsClustered, setSelectedToiletId } = useMap()
const toast = useToast()

// --- СТАН UI ТА МОДАЛОК ---
const showWelcomeModal = ref(false)
const showLocationPrompt = ref(false)
const showRouteChoiceModal = ref(false)
const isAddressSearchOpen = ref(false)
const isAddFormOpen = ref(false)
const isEditModalOpen = ref(false)
const toiletToEdit = ref<Toilet | null>(null)

// --- СТАН МАПИ ---
const isFollowUserActive = ref(false)
const isManualSelectionMode = ref(false)
const isPickingToiletMode = ref(false)
const selectedToiletCoords = ref<[number, number] | null>(null)
const addressSearchContext = ref<'user' | 'toilet'>('user')
const targetToiletForRoute = ref<any>(null)

// --- МАРКЕРИ ТА ПОПАПИ ---
const isRelocatingMode = ref(false)
const relocatingToiletId = ref<string | null>(null)
let userLocationMarker: maplibregl.Marker | null = null
const activeToiletForPopup = ref<Toilet | null>(null)
let pendingReviewMarker: maplibregl.Marker | null = null

// --- 📐 RESPONSIVE: mobile bottom sheet vs desktop popup ---
const DESKTOP_BREAKPOINT = 640
const isDesktop = ref(window.innerWidth >= DESKTOP_BREAKPOINT)

// Слідкуємо за активним туалетом для підсвічування та збільшення маркеру
watch(activeToiletForPopup, (newToilet) => {
  setSelectedToiletId(newToilet ? newToilet.id : null)
})

const handleResize = () => {
  const wasDesktop = isDesktop.value
  isDesktop.value = window.innerWidth >= DESKTOP_BREAKPOINT

  if (wasDesktop !== isDesktop.value && activeToiletForPopup.value) {
    if (activeMapPopup) {
      activeMapPopup.remove()
      activeMapPopup = null
    }
    if (isDesktop.value) {
      nextTick(() => openDesktopPopup(activeToiletForPopup.value!))
    }
  }
}

// --- Десктопний popup (MapLibre), рендериться з прихованого DOM-вузла ---
const popupContentRef = ref<HTMLElement | null>(null)
let activeMapPopup: maplibregl.Popup | null = null

const openDesktopPopup = (toilet: Toilet) => {
  if (!map.value || !popupContentRef.value) return
  if (toilet.longitude == null || toilet.latitude == null) return

  if (activeMapPopup) activeMapPopup.remove()

  activeMapPopup = new maplibregl.Popup({
    closeButton: true,
    closeOnClick: true,
    anchor: 'bottom',
    offset: 25,
    maxWidth: '300px'
  })
      .setDOMContent(popupContentRef.value)
      .setLngLat([toilet.longitude, toilet.latitude])
      .addTo(map.value as any)

  activeMapPopup.on('close', () => {
    if (activeToiletForPopup.value?.id === toilet.id) {
      activeToiletForPopup.value = null
      setSelectedToiletId(null)
    }
  })
}

// ==========================================
// 🔐 НАВІГАЦІЯ
// ==========================================
const navigateTo = (screen: 'map' | 'login' | 'admin') => {
  if (screen === 'map') adminFocusToiletId.value = null
  if (screen === 'admin' && !isAdmin.value) {
    currentScreen.value = 'login'
    return
  }
  currentScreen.value = screen
}

const onLogout = () => {
  handleLogout(currentScreen)
}

// ==========================================
// 🎯 ОБРОБНИКИ ДІЙ UI
// ==========================================
const selectToiletById = (id: string) => {
  if (!map.value) return
  const toilet = approvedToilets.value.find(t => t.id === id)
  if (!toilet) return
  if (toilet.longitude == null || toilet.latitude == null) return

  activeToiletForPopup.value = toilet

  if (isDesktop.value) {
    nextTick(() => openDesktopPopup(toilet))
    map.value.flyTo({
      center: [toilet.longitude, toilet.latitude],
      zoom: Math.max(map.value.getZoom(), 16),
      padding: { top: 350, bottom: 50, left: 20, right: 20 },
      speed: 1.2
    })
  } else {
    map.value.flyTo({
      center: [toilet.longitude, toilet.latitude],
      zoom: Math.max(map.value.getZoom(), 16),
      padding: { bottom: window.innerHeight * 0.4 },
      speed: 1.2
    })
  }
}

const closeActivePopup = () => {
  if (activeMapPopup) {
    activeMapPopup.remove()
    activeMapPopup = null
  }
  activeToiletForPopup.value = null
  setSelectedToiletId(null)
}

const handlePopupRoute = () => {
  if (activeToiletForPopup.value) {
    openRouteChoice(activeToiletForPopup.value)
  }
  closeActivePopup()
}

const handleGpsLocation = () => {
  showLocationPrompt.value = false
  if (isFollowUserActive.value) {
    stopTrackingLocation()
    isFollowUserActive.value = false
  } else {
    isFollowUserActive.value = true
    startTrackingLocation(
        (lat, lng) => flyToCoords(lng, lat, 16),
        () => isFollowUserActive.value = false
    )
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
  const [lat, lng] = temporaryClickedCoords.value || [map.value.getCenter().lat, map.value.getCenter().lng]
  userLocation.value = [lat, lng]
  temporaryClickedCoords.value = null
  isManualSelectionMode.value = false
}

const startPickingToiletLocation = () => isPickingToiletMode.value = true

const snapToiletToUserGps = () => {
  startTrackingLocation((lat, lng) => {
    flyToCoords(lng, lat, 18)
    stopTrackingLocation()
  })
}

const confirmToiletLocation = () => {
  if (!map.value) return
  const [lat, lng] = temporaryClickedCoords.value || [map.value.getCenter().lat, map.value.getCenter().lng]
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
  if (addressSearchContext.value === 'user') userLocation.value = [result.lat, result.lng]
}

const openRouteChoice = (toilet: any) => {
  targetToiletForRoute.value = toilet
  showRouteChoiceModal.value = true
}

const handleGoogleRoute = () => {
  showRouteChoiceModal.value = false
  if (!targetToiletForRoute.value) return
  window.open(`https://www.google.com/maps/dir/?api=1&destination=${targetToiletForRoute.value.latitude},${targetToiletForRoute.value.longitude}`, '_blank')
}

const handleInternalRoute = async () => {
  showRouteChoiceModal.value = false
  if (!targetToiletForRoute.value) return
  if (!userLocation.value) {
    toast.info('Увімкніть геолокацію, щоб ми знали, звідки прокладати маршрут.', { timeout: 5000 })
    return
  }

  isLocating.value = true
  const success = await buildRoute(userLocation.value, [targetToiletForRoute.value.latitude, targetToiletForRoute.value.longitude])
  if (success && activeRouteCoords.value) fitRouteBounds(activeRouteCoords.value)
  isLocating.value = false
}

const handleWelcomeClose = (dontShowAgain: boolean) => {
  if (dontShowAgain) localStorage.setItem('hideAlphaWelcome', 'true')
  showWelcomeModal.value = false
}

const handleTeleportFromAdmin = async (id: string, lat: number, lng: number) => {
  currentScreen.value = 'map'
  await nextTick()

  setTimeout(() => {
    if (map.value) {
      map.value.resize()

      if (pendingReviewMarker) pendingReviewMarker.remove()

      const el = document.createElement('div')
      el.className = 'relative flex flex-col items-center justify-end w-12 h-16 cursor-pointer'
      el.innerHTML = `
        <div class="flex items-center justify-center w-10 h-10 bg-amber-500 text-white rounded-full shadow-[0_0_15px_rgba(245,158,11,0.6)] border-2 border-white animate-bounce relative z-50">
          <span class="material-symbols-outlined text-[24px]">location_on</span>
        </div>
        <div class="absolute bottom-1 left-1/2 -translate-x-1/2 w-5 h-1.5 bg-black/40 rounded-[100%] blur-[1px]"></div>
      `

      const popupNode = document.createElement('div')
      popupNode.className = 'p-3 flex flex-col items-center min-w-[220px] font-sans gap-2'
      popupNode.innerHTML = `
        <span class="text-[10px] font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-100 uppercase tracking-wider mb-1">На перевірці</span>
        <button id="route-btn" class="w-full flex items-center justify-center gap-1.5 bg-indigo-600 text-white text-xs font-bold py-2 rounded-lg hover:bg-indigo-700 active:scale-95 transition-all shadow-sm">
          <span class="material-symbols-outlined text-[16px]">directions_walk</span> Маршрут сюди
        </button>
        <button id="return-admin-btn" class="w-full flex items-center justify-center gap-1.5 bg-slate-100 text-slate-700 text-xs font-bold py-2 rounded-lg hover:bg-slate-200 active:scale-95 transition-all border border-slate-200">
          <span class="material-symbols-outlined text-[16px]">admin_panel_settings</span> Повернутися до заявки
        </button>
      `

      const btnRoute = popupNode.querySelector('#route-btn')
      btnRoute?.addEventListener('click', () => {
        targetToiletForRoute.value = { latitude: lat, longitude: lng }
        showRouteChoiceModal.value = true
      })

      const btnReturn = popupNode.querySelector('#return-admin-btn')
      btnReturn?.addEventListener('click', () => {
        adminFocusToiletId.value = id
        currentScreen.value = 'admin'
      })

      const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, anchor: 'bottom', offset: 45 }).setDOMContent(popupNode)

      pendingReviewMarker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([lng, lat])
          .setPopup(popup)
          .addTo(map.value as any)

      pendingReviewMarker.togglePopup()
      flyToCoords(lng, lat, 18)
    }
  }, 50)
}

// ==========================================
// 🛠️ АДМІН-ДІЇ НА МАПІ
// ==========================================
const handleAdminEdit = (toilet: Toilet) => {
  closeActivePopup()
  toiletToEdit.value = toilet
  isEditModalOpen.value = true
}

const handleAdminMove = (toilet: Toilet) => {
  if (!toilet.longitude || !toilet.latitude) {
    toast.error('У цієї локації відсутні координати')
    return
  }

  closeActivePopup()
  isRelocatingMode.value = true
  relocatingToiletId.value = toilet.id
  flyToCoords(toilet.longitude, toilet.latitude, 17)
}

const handleAdminDelete = async (toiletId: string) => {
  if (!confirm('Ви впевнені, що хочете видалити цей туалет назавжди?')) return
  try {
    await toiletService.deleteToilet(toiletId, [])
    closeActivePopup()
    await refreshMapData()
    toast.success('Локацію успішно видалено')
  } catch (error) {
    console.error(error)
    toast.error('Помилка при видаленні')
  }
}

const handleMapEditSaved = () => {
  isEditModalOpen.value = false
  refreshMapData()
}

const confirmRelocating = async () => {
  if (!relocatingToiletId.value) return
  const [lng, lat] = center.value

  try {
    await toiletService.updateToiletCoordinates(relocatingToiletId.value, lat, lng)
    toast.success('Локацію успішно оновлено')
    await refreshMapData()
  } catch (error) {
    toast.error('Помилка при збереженні нових координат')
  } finally {
    cancelRelocating()
  }
}

const cancelRelocating = () => {
  isRelocatingMode.value = false
  relocatingToiletId.value = null
}

// ==========================================
// 🔄 WATCHERS ТА ЖИТТЄВИЙ ЦИКЛ
// ==========================================
watch([approvedToilets, map], ([newToilets, mapInstance]) => {
  if (!mapInstance || !newToilets.length) return
  updateToiletsClustered(newToilets, selectToiletById)
}, { immediate: true })

watch(userLocation, async (newLoc) => {
  if (!map.value || !newLoc) return
  const [lat, lng] = newLoc

  if (userLocationMarker) {
    userLocationMarker.setLngLat([lng, lat])
  } else {
    const el = document.createElement('div')
    el.className = 'relative flex items-center justify-center w-6 h-6'
    el.innerHTML = `<span class="absolute inline-flex w-full h-full rounded-full bg-indigo-400 opacity-75 animate-ping"></span><span class="relative inline-flex w-4 h-4 rounded-full bg-indigo-600 border-2 border-white shadow-md"></span>`
    userLocationMarker = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map.value as any)
  }

  if (targetToiletForRoute.value && (activeRouteCoords.value?.length ?? 0) > 0) {
    await buildRoute(newLoc, [targetToiletForRoute.value.latitude, targetToiletForRoute.value.longitude])
  }

  if (!isFollowUserActive.value) flyToCoords(lng, lat, 16)
})

watch(activeRouteCoords, (coords) => {
  if (!map.value) return
  if (!coords || coords.length === 0) {
    if (map.value.getLayer('route')) map.value.removeLayer('route')
    if (map.value.getSource('route')) map.value.removeSource('route')
    return
  }

  const geojson: any = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords.map(p => [p[1], p[0]]) } }

  if (map.value.getSource('route')) {
    (map.value.getSource('route') as maplibregl.GeoJSONSource).setData(geojson)
  } else {
    map.value.addSource('route', { type: 'geojson', data: geojson })
    map.value.addLayer({
      id: 'route', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#4f46e5', 'line-width': 5, 'line-opacity': 0.8, 'line-dasharray': [2, 2] }
    })
  }
})

watch(currentScreen, async (newScreen) => {
  if (newScreen === 'map') {
    await nextTick()
    setTimeout(() => { if (map.value) map.value.resize() }, 50)
  } else {
    if (pendingReviewMarker) {
      pendingReviewMarker.remove()
      pendingReviewMarker = null
    }
    closeActivePopup()
  }
})

onMounted(async () => {
  if (localStorage.getItem('hideAlphaWelcome') !== 'true') showWelcomeModal.value = true

  window.addEventListener('resize', handleResize)

  await initAuth(currentScreen)

  const mapInstance = initMap('main-map', () => {
    if (isFollowUserActive.value) {
      stopTrackingLocation()
      isFollowUserActive.value = false
    }
  })

  mapInstance.on('click', (e) => {
    if (isManualSelectionMode.value || isPickingToiletMode.value) {
      temporaryClickedCoords.value = [e.lngLat.lat, e.lngLat.lng]
      flyToCoords(e.lngLat.lng, e.lngLat.lat, mapInstance.getZoom())
    }
  })

  await loadToiletsData()
  initRealtime()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})
</script>

<template>
  <main class="relative w-screen h-dvh overflow-hidden bg-slate-100 font-sans">

    <!-- 📌 СИСТЕМНИЙ ХЕДЕР НАВІГАЦІЇ -->
    <AppNavigation
        :current-screen="currentScreen"
        :is-admin="isAdmin"
        @navigate="navigateTo"
        @logout="onLogout"
    />

    <!-- 🌍 БЛОК МАПИ (Завжди в DOM, ховається через v-show) -->
    <div v-show="currentScreen === 'map'" class="absolute inset-0 w-full h-full">

      <!-- Контейнер MapLibre -->
      <div id="main-map" class="absolute inset-0 w-full h-full z-0"></div>

      <!-- Модалки та UI Мапи -->
      <WelcomeModal :is-open="showWelcomeModal" @close="handleWelcomeClose" />
      <LocationPrompt :is-open="showLocationPrompt" @use-gps="handleGpsLocation" @use-manual="handleManualLocation" @use-address="startAddressSearchForUser" @close="showLocationPrompt = false" />
      <AddToiletForm :is-open="isAddFormOpen" :coords="selectedToiletCoords" @close="isAddFormOpen = false" @submit="handleFormSubmit" />
      <AddressSearchModal :is-open="isAddressSearchOpen" @close="isAddressSearchOpen = false" @select="handleAddressSelected" />
      <RouteChoiceModal :is-open="showRouteChoiceModal" @use-google="handleGoogleRoute" @use-internal="handleInternalRoute" @close="showRouteChoiceModal = false" />
      <RouteInfoBanner :info="routeInfo" @close="clearRoute(); targetToiletForRoute = null" />

      <!-- Модальне вікно редагування вбиральні з мапи -->
      <EditToiletModal
          :is-open="isEditModalOpen"
          :toilet="toiletToEdit"
          @close="isEditModalOpen = false"
          @saved="handleMapEditSaved"
      />

      <!-- Кнопка оновлення -->
      <transition
          enter-active-class="transition duration-300 ease-out"
          enter-from-class="transform -translate-y-10 opacity-0"
          enter-to-class="transform translate-y-0 opacity-100"
          leave-active-class="transition duration-200 ease-in"
          leave-from-class="transform translate-y-0 opacity-100"
          leave-to-class="transform -translate-y-10 opacity-0"
      >
        <div v-if="hasNewData" class="absolute top-24 left-1/2 -translate-x-1/2 z-60">
          <button @click="refreshMapData" class="flex items-center gap-2 px-5 py-2.5 bg-white text-indigo-600 font-bold text-sm rounded-full shadow-lg border border-slate-100 hover:bg-slate-50 active:scale-95 transition-all cursor-pointer">
            <span class="material-symbols-outlined text-[18px] animate-spin-slow">sync</span> Оновити мапу
          </button>
        </div>
      </transition>

      <!-- 🖥️ Прихований контейнер: рендер ToiletPopupCard у DOM (desktop) -->
      <div class="hidden">
        <div ref="popupContentRef">
          <ToiletPopupCard
              v-if="activeToiletForPopup && isDesktop"
              :toilet="activeToiletForPopup"
              :is-admin="isAdmin"
              @build-route="handlePopupRoute"
              @edit="handleAdminEdit"
              @move="handleAdminMove"
              @delete="handleAdminDelete"
          />
        </div>
      </div>

      <!-- 📱 Мобільний Bottom Sheet -->
      <ToiletBottomSheet
          v-if="activeToiletForPopup && !isDesktop"
          :toilet="activeToiletForPopup"
          :is-admin="isAdmin"
          @close="closeActivePopup"
          @build-route="handlePopupRoute"
          @edit="handleAdminEdit"
          @move="handleAdminMove"
          @delete="handleAdminDelete"
      />

      <!-- Оверлеї та Контроли -->
      <UserTargetingOverlay :is-active="isManualSelectionMode" @confirm="confirmManualLocation" />
      <ToiletTargetingOverlay :is-active="isPickingToiletMode" @snap-gps="snapToiletToUserGps" @search="handleAddressSearchForToilet" @confirm="confirmToiletLocation" @cancel="isPickingToiletMode = false" />
      <RelocateOverlay :is-active="isRelocatingMode" @confirm="confirmRelocating" @cancel="cancelRelocating" />
      <MapControls
          v-show="!isManualSelectionMode && !isPickingToiletMode && !(activeToiletForPopup && !isDesktop)"
          :is-locating="isLocating"
          @locate="showLocationPrompt = true"
          @add="startPickingToiletLocation"
          @zoom-in="map?.zoomIn({ duration: 300 })"
          @zoom-out="map?.zoomOut({ duration: 300 })"
          @compass="map?.resetNorthPitch({ duration: 500 })"
      />
    </div>

    <!-- 🔐 ЕКРАН LOGIN -->
    <LoginView
        v-if="currentScreen === 'login'"
        class="absolute inset-0 z-50 bg-slate-50"
        @close="currentScreen = 'map'"
    />

    <!-- 🛡️ ЕКРАН АДМІНКИ -->
    <AdminView
        v-if="currentScreen === 'admin' && isAdmin"
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