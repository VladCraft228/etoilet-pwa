<script setup lang="ts">
// 1. Імпортуємо shallowRef замість ref для карти та маркерів
import {ref, shallowRef, computed, onMounted, watch, markRaw, defineAsyncComponent} from 'vue'
import maplibregl from 'maplibre-gl'

import 'maplibre-gl/dist/maplibre-gl.css'

// 1.1 СЕРВІСИ ТА КОМПОЗИЦІЙНІ ФУНКЦІЇ
import { toiletService } from './services/toiletService'
import { useGeolocation } from './composables/useGeolocation.ts'
import { useRouting } from './composables/useRouting.ts'

// 1.2 БАЗОВІ КОМПОНЕНТИ КАРТИ
import MapControls from './components/map/MapControls.vue'
import ToiletTargetingOverlay from "./components/map/ToiletTargetingOverlay.vue"
import UserTargetingOverlay from "./components/map/UserTargetingOverlay.vue"
import RouteInfoBanner from "./components/map/RouteInfoBanner.vue"
import { useToast } from "vue-toastification"
import { supabase } from "./supabase.ts"
import ToiletPopupCard from "./components/map/ToiletPopupCard.vue";

// 1.3 ЛІНИВІ КОМПОНЕНТИ ТА ВІКНА
const LocationPrompt = defineAsyncComponent(() => import('./components/features/LocationPrompt.vue'))
const AddToiletForm = defineAsyncComponent(() => import('./components/features/AddToiletForm.vue'))
const AddressSearchModal = defineAsyncComponent(() => import('./components/features/AddressSearchModal.vue'))
const WelcomeModal = defineAsyncComponent(() => import('./components/features/WelcomeModal.vue'))
const RouteChoiceModal = defineAsyncComponent(() => import('./components/features/RouteChoiceModal.vue'))

// 2. КОМПОЗИЦІЙНІ ФУНКЦІЇ (Composables)
const { userLocation, isLocating, getCurrentLocation } = useGeolocation()
const { activeRouteCoords, routeInfo, buildRoute, clearRoute } = useRouting()

// 3. РЕАКТИВНИЙ СТАН КАРТИ MAPLIBRE
ref<HTMLElement | null>(null);
const map = shallowRef<any>(null) // Гнучке посилання без глибокої реактивності

const zoom = ref(13)
const center = ref<[number, number]>([35.0461, 48.4647]) // [lng, lat]
const approvedToilets = ref<any[]>([])

// ВИПРАВЛЕННЯ: Використовуємо shallowRef<any[]>, щоб TS не сканував нутрощі класів маркерів
const toiletMarkers = shallowRef<any[]>([])
let userLocationMarker: any = null

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

// 3.3 СТАН ОНОВЛЕННЯ ДАНИХ
const toast = useToast()
const hasNewData = ref(false)

// Функція для завантаження даних з бази
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

// Отримання поточного центру
const currentMapCenter = computed<[number, number]>(() => {
  if (!map.value) return center.value
  const c = map.value.getCenter()
  return [c.lng, c.lat]
})

// Посилання на HTML-контейнер нашого попапу
const popupContentRef = ref<HTMLElement | null>(null)
// Дані туалету, які зараз показуються в попапі
const activeToiletForPopup = ref<any>(null)
// Глобальне посилання на попап MapLibre (щоб ми могли його видаляти)
let activeMapPopup: maplibregl.Popup | null = null

// Функція, яка зловить клік з компонента і побудує маршрут
const handlePopupRoute = () => {
  if (activeMapPopup) activeMapPopup.remove() // Закриваємо віконце
  if (activeToiletForPopup.value) {
    openRouteChoice(activeToiletForPopup.value) // Відкриваємо модалку маршруту
  }
}

// 5. ЖИТТЄВИЙ ЦИКЛ & ІНІЦІАЛІЗАЦІЯ 3D КАРТИ
onMounted(() => {
  console.log('🚀 Старт ініціалізації карти...');

  const isWelcomeHidden = localStorage.getItem('hideAlphaWelcome')
  if (isWelcomeHidden !== 'true') {
    showWelcomeModal.value = true
  }

  // Створюємо карту, передаючи ID рядком, а не Vue-змінною
  const mapInstance = new maplibregl.Map({
    container: 'main-map',
    style: 'https://tiles.openfreemap.org/styles/liberty',
    center: center.value,
    zoom: zoom.value,

    // Блокуємо 3D-нахили
    pitch: 0,
    dragPitch: false,
    touchPitch: false, // Забороняємо нахил двома пальцями на мобілках

    // МАГІЯ РОЗДІЛЕННЯ ПК ТА МОБІЛОК:
    dragRotate: false,       // Блокуємо обертання правою кнопкою миші (ПК)
    touchZoomRotate: true,   // ДОЗВОЛЯЄМО обертання двома пальцями (Мобілки)

    maxZoom: 19,
    minZoom: 5
  })

  console.log('✅ Інстанс створено:', mapInstance);

  mapInstance.addControl(new maplibregl.NavigationControl({
    visualizePitch: true
  }), 'bottom-right')

  // ХАК: Змушуємо карту перерахувати свої розміри після того, як вона завантажиться
  mapInstance.on('load', () => {
    console.log('🗺️ Карта завантажила стилі, робимо resize!');
    mapInstance.resize();
  })

  mapInstance.on('moveend', () => {
    const c = mapInstance.getCenter()
    center.value = [c.lng, c.lat]
    zoom.value = mapInstance.getZoom()
  })

  map.value = markRaw(mapInstance)

  // Запускаємо завантаження даних
  loadToiletsData()

  // Realtime
  supabase
      .channel('public:toilets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'toilets' }, () => {
        if (!hasNewData.value) {
          hasNewData.value = true
          toast.warning('Знайдено нові дані! Оновіть карту.')
        }
      })
      .subscribe()
})

// 5.1 WATCHERS ДЛЯ РЕАКТИВНОГО ОНОВЛЕННЯ ЕЛЕМЕНТІВ КАРТИ
watch([approvedToilets, map], ([newToilets, mapInstance]) => {
  if (!mapInstance || !newToilets.length) return

  // Видаляємо старі маркери з карти
  toiletMarkers.value.forEach(m => m.remove())
  const newMarkers: any[] = []

  newToilets.forEach(toilet => {
    // 1. СТВОРЮЄМО ОБГОРТКУ (щоб MapLibre і Tailwind не билися за transform)
    const wrapper = document.createElement('div')

    // 2. СТВОРЮЄМО САМ МАРКЕР
    const el = document.createElement('div')
    el.className = 'flex items-center justify-center w-9 h-9 text-white rounded-full shadow-lg border-2 border-white cursor-pointer transition-transform active:scale-90'
    el.className += toilet.type === 'public' ? ' bg-blue-600' : ' bg-emerald-500'
    el.innerHTML = `<span class="material-symbols-outlined text-[20px]">wc</span>`

    // Вкладаємо маркер в обгортку
    wrapper.appendChild(el)

    // 3. ДОДАЄМО ОБРОБНИК КЛІКУ ТА ПОПАП
    wrapper.addEventListener('click', (e) => {
      e.stopPropagation()

      // Передаємо дані клікнутого туалету у наш Vue-компонент
      activeToiletForPopup.value = toilet

      // Якщо вже є відкритий попап — закриваємо його! (Вирішує проблему стакання)
      if (activeMapPopup) {
        activeMapPopup.remove()
      }

      // Трюк: чекаємо 1 тік (nextTick), щоб Vue встиг оновити дані в DOM
      import('vue').then(({ nextTick }) => {
        nextTick(() => {
          if (!popupContentRef.value) return

          // Створюємо попап і передаємо йому готовий HTML-вузол з нашого шаблону
          activeMapPopup = new maplibregl.Popup({
            closeButton: true, // Можна увімкнути хрестик для зручності
            closeOnClick: true,
            offset: 20,
            maxWidth: '320px'
          })
              .setDOMContent(popupContentRef.value!) // Телепортуємо наш Vue-компонент сюди!
              .setLngLat([toilet.longitude, toilet.latitude])
              .addTo(mapInstance)

          // Центруємо камеру на маркері
          mapInstance.flyTo({
            center: [toilet.longitude, toilet.latitude],
            zoom: Math.max(mapInstance.getZoom(), 15),
            speed: 1.2
          })
        })
      })
    })

    // Додаємо маркер на карту (використовуючи обгортку!)
    const marker = new maplibregl.Marker({ element: wrapper })
        .setLngLat([toilet.longitude, toilet.latitude])
        .addTo(mapInstance)

    newMarkers.push(marker)
  })

  toiletMarkers.value = newMarkers
}, { immediate: true })

// Слідкуємо за локацією користувача
watch(userLocation, (newLoc) => {
  if (!map.value || !newLoc) return

  if (userLocationMarker) {
    userLocationMarker.setLngLat([newLoc[1], newLoc[0]])
  } else {
    const el = document.createElement('div')
    el.className = 'relative flex items-center justify-center w-6 h-6'
    el.innerHTML = `
      <span class="absolute inline-flex w-full h-full rounded-full bg-indigo-400 opacity-75 animate-ping"></span>
      <span class="relative inline-flex w-4 h-4 rounded-full bg-indigo-600 border-2 border-white shadow-md"></span>
    `
    userLocationMarker = new maplibregl.Marker({ element: el })
        .setLngLat([newLoc[1], newLoc[0]])
        .addTo(map.value)
  }
})

// Слідкуємо за побудовою маршруту
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
    map.value.addSource('route', {
      type: 'geojson',
      data: geojson
    })

    map.value.addLayer({
      id: 'route',
      type: 'line',
      source: 'route',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': '#4f46e5',
        'line-width': 5,
        'line-opacity': 0.8,
        'line-dasharray': [2, 2]
      }
    })
  }
})

// 6. ФУНКЦІЇ ТА ЛОГІКА
const handleWelcomeClose = (dontShowAgain: boolean) => {
  if (dontShowAgain) {
    localStorage.setItem('hideAlphaWelcome', 'true')
  }
  showWelcomeModal.value = false
}

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

const handleGpsLocation = () => {
  showLocationPrompt.value = false
  getCurrentLocation((lat, lng) => {
    flyToCoords(lng, lat, 16)
  })
}

const handleManualLocation = () => {
  showLocationPrompt.value = false
  isManualSelectionMode.value = true
}

const confirmManualLocation = () => {
  const [lng, lat] = currentMapCenter.value
  userLocation.value = [lat, lng]
  isManualSelectionMode.value = false
}

const startPickingToiletLocation = () => {
  isPickingToiletMode.value = true
}

const snapToiletToUserGps = () => {
  getCurrentLocation((lat, lng) => {
    flyToCoords(lng, lat, 18)
  })
}

const confirmToiletLocation = () => {
  const [lng, lat] = currentMapCenter.value
  selectedToiletCoords.value = [lat, lng]
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
    toast.error('Сталася помилка під час збереження. Будь ласка, спробуйте ще раз.')
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
    toast.info('Увімкніть геолокацію (кнопка прицілу внизу), щоб ми знали, звідки прокладати маршрут.', { timeout: 5000 })
    return
  }

  const toilet = targetToiletForRoute.value
  const endCoords: [number, number] = [toilet.latitude, toilet.longitude]

  isLocating.value = true
  const success = await buildRoute(userLocation.value, endCoords)

  if (success) {
    flyToCoords(toilet.longitude, toilet.latitude, 16)
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
    />

  </main>
</template>
<style>
/* 1. Прибираємо жахливі білі рамки та робимо круглі кути */
.maplibregl-popup-content {
  padding: 0 !important;
  border-radius: 16px !important;
  box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1) !important;
  border: none !important;
  overflow: hidden; /* Щоб фотографія не вилазила за круглі кути */
}

/* 2. Робимо красивим хрестик закриття */
.maplibregl-popup-close-button {
  font-size: 24px !important;
  color: #475569 !important; /* Сірий колір Tailwind (slate-600) */
  padding: 4px 8px !important;
  right: 8px !important;
  top: 8px !important;
  border-radius: 50% !important;
  transition: all 0.2s !important;
  background-color: rgba(255, 255, 255, 0.8) !important; /* Напівпрозорий білий фон */
}

.maplibregl-popup-close-button:hover {
  background-color: #f1f5f9 !important; /* slate-100 при наведенні */
  color: #0f172a !important;
}

/* 3. Трохи стилізуємо трикутник (стрілочку) внизу попапу */
.maplibregl-popup-tip {
  border-top-color: #ffffff !important;
}
</style>