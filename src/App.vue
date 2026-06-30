<script setup lang="ts">
// 1. ІМПОРТИ ТА БІБЛІОТЕКИ
import { ref, computed, onMounted } from 'vue'
import L from 'leaflet'
import {LMap, LMarker, LPopup, LIcon, LPolyline} from '@vue-leaflet/vue-leaflet'

import 'leaflet/dist/leaflet.css'
import 'maplibre-gl/dist/maplibre-gl.css'
import '@maplibre/maplibre-gl-leaflet'

// 1.1 КОМПОНЕНТИ ТА СЕРВІСИ
import MapControls from './components/map/MapControls.vue'
import ToiletPopupCard from './components/map/ToiletPopupCard.vue'
import LocationPrompt from './components/features/LocationPrompt.vue'
import AddToiletForm from './components/features/AddToiletForm.vue'
import AddressSearchModal from './components/features/AddressSearchModal.vue'
import WelcomeModal from './components/features/WelcomeModal.vue'
import { toiletService } from './services/toiletService'
import { useGeolocation } from './composables/useGeolocation.ts'
import { useRouting } from './composables/useRouting.ts'
import ToiletTargetingOverlay from "./components/map/ToiletTargetingOverlay.vue";
import UserTargetingOverlay from "./components/map/UserTargetingOverlay.vue";
import RouteInfoBanner from "./components/map/RouteInfoBanner.vue";
import RouteChoiceModal from "./components/features/RouteChoiceModal.vue";

// 2. КОМПОЗИЦІЙНІ ФУНКЦІЇ (Composables)
const { userLocation, isLocating, getCurrentLocation } = useGeolocation()
const { activeRouteCoords, routeInfo, buildRoute, clearRoute } = useRouting()


// 3. РЕАКТИВНИЙ СТАН (Стан карти та даних)
const center = ref<any>([48.4647, 35.0461]) // Дніпро
const zoom = ref(13)
const approvedToilets = ref<any[]>([])

// 3.1 СТАН МОДАЛЬНИХ ВІКОН
const showWelcomeModal = ref(false)
const showLocationPrompt = ref(false)
const showRouteChoiceModal = ref(false)
const targetToiletForRoute = ref<any>(null)
const isAddressSearchOpen = ref(false)
const isAddFormOpen = ref(false)

// 3.2 СТАН РЕЖИМІВ КАРТИ
const isManualSelectionMode = ref(false)
const isPickingToiletMode = ref(false)
const selectedToiletCoords = ref<[number, number] | null>(null)
const addressSearchContext = ref<'user' | 'toilet'>('user')

// 4. ОБЧИСЛЮВАНІ ВЛАСТИВОСТІ (Computed)
const currentMapCenter = computed<[number, number]>(() => {
  if (Array.isArray(center.value)) return [center.value[0], center.value[1]]
  return [center.value.lat, center.value.lng]
})

// 5. ЖИТТЄВИЙ ЦИКЛ (Хуки)
onMounted(async () => {
  const isWelcomeHidden = localStorage.getItem('hideAlphaWelcome')
  if (isWelcomeHidden !== 'true') {
    showWelcomeModal.value = true
  }

  try {
    const data = await toiletService.fetchApprovedToilets()
    if (data) approvedToilets.value = data
  } catch (error) {
    console.error('Помилка завантаження точок:', error)
  }
})

// 6. ФУНКЦІЇ ТА ЛОГІКА
const onMapReady = (mapInstance: any) => {
  L.maplibreGL({
    style: 'https://tiles.openfreemap.org/styles/bright',
  }).addTo(mapInstance)
}

// 6.1 Логіка стартових вікон
const handleWelcomeClose = (dontShowAgain: boolean) => {
  if (dontShowAgain) {
    localStorage.setItem('hideAlphaWelcome', 'true')
  }
  showWelcomeModal.value = false
}

// 6.2 Логіка локації користувача (Сценарій А)
const handleGpsLocation = () => {
  showLocationPrompt.value = false
  getCurrentLocation((lat, lng) => {
    center.value = [lat, lng]
    zoom.value = 16
  })
}

const handleManualLocation = () => {
  showLocationPrompt.value = false
  isManualSelectionMode.value = true
}

const confirmManualLocation = () => {
  userLocation.value = currentMapCenter.value
  isManualSelectionMode.value = false
}

// 6.3 Логіка додавання туалету (Сценарій Б)
const startPickingToiletLocation = () => {
  isPickingToiletMode.value = true
}

const snapToiletToUserGps = () => {
  getCurrentLocation((lat, lng) => {
    center.value = [lat, lng]
    zoom.value = 18
  })
}

const confirmToiletLocation = () => {
  selectedToiletCoords.value = currentMapCenter.value
  isPickingToiletMode.value = false
  isAddFormOpen.value = true
}

const handleFormSubmit = async (formData: any) => {
  try {
    await toiletService.addToilet(formData)
    isAddFormOpen.value = false
    alert('Дякуємо! Вбиральня надіслана на перевірку модераторам.')
  } catch (error: any) {
    console.error('Помилка відправки в базу:', error.message)
    alert('Сталася помилка при відправці. Спробуйте ще раз.')
  }
}

// 6.4 Логіка пошуку адреси
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
  center.value = [result.lat, result.lng]
  zoom.value = 17

  if (addressSearchContext.value === 'user') {
    userLocation.value = [result.lat, result.lng]
  }
}

// 6.5 Логіка побудови маршруту
const openRouteChoice = (toilet: any) => {
  targetToiletForRoute.value = toilet
  showRouteChoiceModal.value = true
}

// ВАРІАНТ 1: GOOGLE MAPS
const handleGoogleRoute = () => {
  showRouteChoiceModal.value = false
  if (!targetToiletForRoute.value) return

  const { latitude, longitude } = targetToiletForRoute.value
  // Формуємо універсальне посилання, яке на телефонах відкриє рідний додаток Google Maps
  const url = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`
  window.open(url, '_blank')
}

// ВАРІАНТ 2: ВБУДОВАНИЙ МАРШРУТ (Наш OSRM)
const handleInternalRoute = async () => {
  showRouteChoiceModal.value = false
  if (!targetToiletForRoute.value) return

  if (!userLocation.value) {
    alert('Спочатку визначте своє розташування (кнопка прицілу внизу екрана), щоб ми знали звідки будувати маршрут.')
    return
  }

  const toilet = targetToiletForRoute.value
  const endCoords: [number, number] = [toilet.latitude, toilet.longitude]

  isLocating.value = true
  const success = await buildRoute(userLocation.value, endCoords)

  if (success) {
    zoom.value = 16
  }
  isLocating.value = false
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

    <RouteInfoBanner :info="routeInfo" @close="clearRoute" />

    <l-map
        v-model:zoom="zoom"
        v-model:center="center"
        :use-global-leaflet="false"
        :options="{ tap: false }"
        @ready="onMapReady"
    >
      <l-marker v-if="userLocation" :lat-lng="userLocation">
        <l-icon :icon-size="[24, 24]" :icon-anchor="[12, 12]" class-name="!bg-transparent !border-none">
          <div class="relative flex items-center justify-center w-6 h-6">
            <span class="absolute inline-flex w-full h-full rounded-full bg-indigo-400 opacity-75 animate-ping"></span>
            <span class="relative inline-flex w-4 h-4 rounded-full bg-indigo-600 border-2 border-white shadow-md"></span>
          </div>
        </l-icon>
      </l-marker>

      <l-marker
          v-for="toilet in approvedToilets"
          :key="toilet.id"
          :lat-lng="[toilet.latitude, toilet.longitude]"
      >
        <l-icon :icon-size="[36, 36]" :icon-anchor="[18, 36]" class-name="!bg-transparent !border-none">
          <div v-if="toilet.type === 'public'" class="flex items-center justify-center w-9 h-9 bg-blue-600 text-white rounded-full shadow-lg border-2 border-white">
            <span class="material-symbols-outlined text-[20px]">wc</span>
          </div>
          <div v-else class="flex items-center justify-center w-9 h-9 bg-emerald-500 text-white rounded-full shadow-lg border-2 border-white">
            <span class="material-symbols-outlined text-[20px]">wc</span>
          </div>
        </l-icon>

        <l-popup>
          <ToiletPopupCard :toilet="toilet" @build-route="openRouteChoice" />
        </l-popup>
      </l-marker>

      <l-polyline
          v-if="activeRouteCoords"
          :lat-lngs="activeRouteCoords"
          color="#4f46e5"
          :weight="5"
          :opacity="0.8"
          dash-array="10, 10"
      />
    </l-map>

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
    />

  </main>
</template>