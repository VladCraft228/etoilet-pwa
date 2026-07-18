<script setup lang="ts">
import { ref, watch, onMounted, defineAsyncComponent, onUnmounted, nextTick } from 'vue'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

// --- СЕРВІСИ ТА КОМПОЗИЦІЙНІ ФУНКЦІЇ ---
import { toiletService } from './services/toiletService'
import { useGeolocation } from './composables/useGeolocation'
import { useRouting } from './composables/useRouting'
import { useMap } from './composables/useMap'
import { useToast } from "vue-toastification"
import { supabase } from "./supabase"

// --- БАЗОВІ КОМПОНЕНТИ ---
import MapControls from './components/map/MapControls.vue'
import ToiletTargetingOverlay from "./components/map/ToiletTargetingOverlay.vue"
import UserTargetingOverlay from "./components/map/UserTargetingOverlay.vue"
import RouteInfoBanner from "./components/map/RouteInfoBanner.vue"
import ToiletPopupCard from "./components/map/ToiletPopupCard.vue"
import AdminView from "./components/views/AdminView.vue"
import LoginView from "./components/views/LoginView.vue"

// --- ЛІНИВІ КОМПОНЕНТИ ---
const LocationPrompt = defineAsyncComponent(() => import('./components/features/LocationPrompt.vue'))
const AddToiletForm = defineAsyncComponent(() => import('./components/features/AddToiletForm.vue'))
const AddressSearchModal = defineAsyncComponent(() => import('./components/features/AddressSearchModal.vue'))
const WelcomeModal = defineAsyncComponent(() => import('./components/features/WelcomeModal.vue'))
const RouteChoiceModal = defineAsyncComponent(() => import('./components/features/RouteChoiceModal.vue'))

// --- ІНІЦІАЛІЗАЦІЯ ХУКІВ ---
const { userLocation, isLocating, startTrackingLocation, stopTrackingLocation } = useGeolocation()
const { activeRouteCoords, routeInfo, buildRoute, clearRoute } = useRouting()
const { map, temporaryClickedCoords, initMap, flyToCoords, fitRouteBounds, updateToiletsClustered } = useMap()
const toast = useToast()

// --- СТАН ДОДАТКУ ---
const currentScreen = ref<'map' | 'login' | 'admin'>('map')
const isAdmin = ref(false)
const hasNewData = ref(false)
const approvedToilets = ref<any[]>([])
const adminFocusToiletId = ref<string | null>(null)

// --- СТАН UI ТА МОДАЛОК ---
const showWelcomeModal = ref(false)
const showLocationPrompt = ref(false)
const showRouteChoiceModal = ref(false)
const isAddressSearchOpen = ref(false)
const isAddFormOpen = ref(false)

// --- СТАН МАПИ ---
const isFollowUserActive = ref(false)
const isManualSelectionMode = ref(false)
const isPickingToiletMode = ref(false)
const selectedToiletCoords = ref<[number, number] | null>(null)
const addressSearchContext = ref<'user' | 'toilet'>('user')
const targetToiletForRoute = ref<any>(null)

// --- МАРКЕРИ ТА ПОПАПИ ---
let userLocationMarker: maplibregl.Marker | null = null
const popupContentRef = ref<HTMLElement | null>(null)
const activeToiletForPopup = ref<any>(null)
let activeMapPopup: maplibregl.Popup | null = null
let toiletsChannel: any = null
let pendingReviewMarker: maplibregl.Marker | null = null


// ==========================================
// 🔐 АВТОРИЗАЦІЯ ТА НАВІГАЦІЯ
// ==========================================
const checkAdminRole = async (userId: string) => {
  try {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).single()
    isAdmin.value = profile?.role === 'admin'
  } catch (err) {
    console.error('Помилка перевірки ролі:', err)
    isAdmin.value = false
  }
}

const navigateTo = (screen: 'map' | 'login' | 'admin') => {
  if (screen === 'map') adminFocusToiletId.value = null // Скидаємо фокус
  if (screen === 'admin' && !isAdmin.value) {
    currentScreen.value = 'login'
    return
  }
  currentScreen.value = screen
}

const handleLogout = async () => {
  await supabase.auth.signOut()
  isAdmin.value = false
  currentScreen.value = 'map'
}


// ==========================================
// 🌍 ДАНІ МАПИ ТА REALTIME
// ==========================================
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

const subscribeToToiletsRealtime = () => {
  if (toiletsChannel) supabase.removeChannel(toiletsChannel)

  toiletsChannel = supabase
      .channel('public:toilets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'toilets' }, (payload) => {
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
      })
      .subscribe()
}


// ==========================================
// 🎯 ОБРОБНИКИ ДІЙ UI
// ==========================================
const selectToiletById = (id: string) => {
  if (!map.value) return
  const toilet = approvedToilets.value.find(t => t.id === id)
  if (!toilet) return

  activeToiletForPopup.value = toilet
  if (activeMapPopup) activeMapPopup.remove()

  import('vue').then(({ nextTick }) => {
    nextTick(() => {
      if (!popupContentRef.value) return
      activeMapPopup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, offset: 20, maxWidth: '320px' })
          .setDOMContent(popupContentRef.value!)
          .setLngLat([toilet.longitude, toilet.latitude])
          .addTo(map.value as any)

      map.value!.flyTo({ center: [toilet.longitude, toilet.latitude], zoom: Math.max(map.value!.getZoom(), 15), speed: 1.2 })
    })
  })
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

// Телепортація з адмін-панелі до конкретної мітки
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

      // РОЗШИРЕНИЙ ПОПАП З ДВОМА КНОПКАМИ
      const popupNode = document.createElement('div')
      popupNode.className = 'p-3 flex flex-col items-center min-w-[220px] font-sans gap-2'
      popupNode.innerHTML = `
        <span class="text-[10px] font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-100 uppercase tracking-wider mb-1">На перевірці</span>

        <button id="route-btn" class="w-full flex items-center justify-center gap-1.5 bg-indigo-600 text-white text-xs font-bold py-2 rounded-lg hover:bg-indigo-700 active:scale-95 transition-all shadow-sm">
          <span class="material-symbols-outlined text-[16px]">directions_walk</span>
          Маршрут сюди
        </button>

        <button id="return-admin-btn" class="w-full flex items-center justify-center gap-1.5 bg-slate-100 text-slate-700 text-xs font-bold py-2 rounded-lg hover:bg-slate-200 active:scale-95 transition-all border border-slate-200">
          <span class="material-symbols-outlined text-[16px]">admin_panel_settings</span>
          Повернутися до заявки
        </button>
      `

      const btnRoute = popupNode.querySelector('#route-btn')
      btnRoute?.addEventListener('click', () => {
        targetToiletForRoute.value = { latitude: lat, longitude: lng }
        showRouteChoiceModal.value = true
      })

      // Обробник нової кнопки повернення
      const btnReturn = popupNode.querySelector('#return-admin-btn')
      btnReturn?.addEventListener('click', () => {
        adminFocusToiletId.value = id // Запам'ятовуємо ID
        currentScreen.value = 'admin' // Відкриваємо адмінку
      })

      const popup = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: true,
        offset: 45
      }).setDOMContent(popupNode)

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

// Відновлення мапи після закриття адмінки/логіну
watch(currentScreen, async (newScreen) => {
  if (newScreen === 'map') {
    await nextTick()
    setTimeout(() => { if (map.value) map.value.resize() }, 50)
  } else {
    // Якщо ми пішли з карти (в адмінку чи кудись ще) – прибираємо тимчасовий маркер
    if (pendingReviewMarker) {
      pendingReviewMarker.remove()
      pendingReviewMarker = null
    }
  }
})

onMounted(async () => {
  if (localStorage.getItem('hideAlphaWelcome') !== 'true') showWelcomeModal.value = true

  const { data: { session } } = await supabase.auth.getSession()
  if (session) await checkAdminRole(session.user.id)

  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session) {
      await checkAdminRole(session.user.id)
      if (isAdmin.value && currentScreen.value === 'login') currentScreen.value = 'admin'
      else if (!isAdmin.value && currentScreen.value === 'login') {
        toast.error('У вас немає прав доступу.')
        await supabase.auth.signOut()
      }
    } else {
      isAdmin.value = false
      if (currentScreen.value === 'admin') currentScreen.value = 'map'
    }
  })

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
  subscribeToToiletsRealtime()
})

onUnmounted(() => {
  if (toiletsChannel) supabase.removeChannel(toiletsChannel)
})
</script>

<template>
  <main class="relative w-screen h-dvh overflow-hidden bg-slate-100 font-sans">

    <!-- 📌 СИСТЕМНИЙ ХЕДЕР НАВІГАЦІЇ (Завжди зверху) -->
    <div class="absolute top-4 left-4 z-100 flex gap-2 pointer-events-auto">
      <button
          v-if="currentScreen !== 'map'"
          @click="navigateTo('map')"
          class="flex items-center gap-1.5 px-3 py-2 bg-white text-slate-800 text-xs font-bold rounded-xl shadow-md border border-slate-100 hover:bg-slate-50 active:scale-95 transition-all cursor-pointer"
      >
        <span class="material-symbols-outlined text-[16px]">map</span> На карту
      </button>
      <button
          v-if="currentScreen === 'map'"
          @click="navigateTo('admin')"
          class="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl shadow-md hover:bg-indigo-700 active:scale-95 transition-all cursor-pointer"
      >
        <span class="material-symbols-outlined text-[16px]">admin_panel_settings</span>
        {{ isAdmin ? 'Адмінка' : 'Вхід для адміна' }}
      </button>
      <button
          v-if="isAdmin && currentScreen !== 'map'"
          @click="handleLogout"
          class="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-600 text-xs font-bold rounded-xl shadow-md border border-red-100 hover:bg-red-100 active:scale-95 transition-all cursor-pointer"
      >
        <span class="material-symbols-outlined text-[16px]">logout</span> Вийти
      </button>
    </div>

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
            <span class="material-symbols-outlined text-[18px] animate-spin-slow">sync</span> Оновити карту
          </button>
        </div>
      </transition>

      <!-- Прихований Попап -->
      <div class="hidden">
        <div ref="popupContentRef" class="w-full">
          <ToiletPopupCard v-if="activeToiletForPopup" :toilet="activeToiletForPopup" @build-route="handlePopupRoute" />
        </div>
      </div>

      <!-- Оверлеї та Контроли -->
      <UserTargetingOverlay :is-active="isManualSelectionMode" @confirm="confirmManualLocation" />
      <ToiletTargetingOverlay :is-active="isPickingToiletMode" @snap-gps="snapToiletToUserGps" @search="handleAddressSearchForToilet" @confirm="confirmToiletLocation" @cancel="isPickingToiletMode = false" />
      <MapControls v-show="!isManualSelectionMode && !isPickingToiletMode" :is-locating="isLocating" @locate="showLocationPrompt = true" @add="startPickingToiletLocation" @zoom-in="map?.zoomIn({ duration: 300 })" @zoom-out="map?.zoomOut({ duration: 300 })" @compass="map?.resetNorthPitch({ duration: 500 })" />
    </div>

    <!-- 🔐 ЕКРАН LOGIN (Перекриває мапу завдяки абсолюту та фону) -->
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
        @logout="handleLogout"
        @teleport="handleTeleportFromAdmin"
    />

  </main>
</template>