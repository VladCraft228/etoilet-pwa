<script setup lang="ts">
import {ref, computed, onMounted} from 'vue'
import 'leaflet/dist/leaflet.css'
import {LMap, LMarker, LPopup, LIcon} from '@vue-leaflet/vue-leaflet'
import L from 'leaflet'
import 'maplibre-gl/dist/maplibre-gl.css'
import '@maplibre/maplibre-gl-leaflet'
import MapControls from './components/map/MapControls.vue'
import LocationPrompt from './components/features/LocationPrompt.vue'
import AddToiletForm from './components/features/AddToiletForm.vue'
import { toiletService } from './services/toiletService'
import AddressSearchModal from "./components/features/AddressSearchModal.vue";

const center = ref<any>([48.4647, 35.0461]) // Дніпро
const zoom = ref(13)

const userLocation = ref<[number, number] | null>(null)
const isLocating = ref(false)

// СТАНИ ДЛЯ UI Попапів
const showLocationPrompt = ref(true) // Попап при старті (Де ви?)
const isManualSelectionMode = ref(false) // Ручний вибір де знаходиТЕСЬ ви

// НОВІ СТАНИ ДЛЯ ВИБОРУ МІСЦЯ ТУАЛЕТУ
const isPickingToiletMode = ref(false) // Режим мітки самого туалету
const selectedToiletCoords = ref<[number, number] | null>(null)
const isAddFormOpen = ref(false)

// НОВИЙ СТАН ДЛЯ ВБИРАЛЕНЬ
const approvedToilets = ref<any[]>([])
// Завантажуємо точки при старті додатку
onMounted(async () => {
  try {
    const data = await toiletService.fetchApprovedToilets()
    if (data) approvedToilets.value = data
  } catch (error) {
    console.error('Помилка завантаження точок:', error)
  }
})
// Безпечний computed для координат центру карти
const currentMapCenter = computed<[number, number]>(() => {
  if (Array.isArray(center.value)) return [center.value[0], center.value[1]]
  return [center.value.lat, center.value.lng]
})

// GPS геолокація користувача
const handleGpsLocation = () => {
  showLocationPrompt.value = false
  if (!navigator.geolocation) return alert('Геолокація не підтримується')

  isLocating.value = true
  navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        userLocation.value = [latitude, longitude]
        center.value = [latitude, longitude]
        zoom.value = 16
        isLocating.value = false
      },
      (error) => {
        console.warn(error)
        isLocating.value = false
        alert('Помилка геолокації. Дозвольте доступ або оберіть інший спосіб.')
      },
      { enableHighAccuracy: true }
  )
}

const handleManualLocation = () => {
  showLocationPrompt.value = false
  isManualSelectionMode.value = true
}

const confirmManualLocation = () => {
  userLocation.value = currentMapCenter.value
  isManualSelectionMode.value = false
}

// Швидке центрування прицілу туалету на поточний GPS користувача
const snapToiletToUserGps = () => {
  if (!navigator.geolocation) return alert('Геолокація не підтримується')

  isLocating.value = true // увімкне спінер, якщо захочеш
  navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        userLocation.value = [latitude, longitude]
        center.value = [latitude, longitude] // Мапа сама центрирується, і приціл стане куди треба
        zoom.value = 18 // Наближаємо по максимуму для точності
        isLocating.value = false
      },
      (error) => {
        console.warn(error)
        isLocating.value = false
        alert('Не вдалося зловити супутники. Спробуйте посунути карту вручну.')
      },
      { enableHighAccuracy: true }
  )
}

// Крок 1 для додавання туалету: вмикаємо режим прицілу для ТУАЛЕТУ
const startPickingToiletLocation = () => {
  isPickingToiletMode.value = true
}

// Крок 2 для додавання туалету: фіксуємо координати і відкриваємо форму
const confirmToiletLocation = () => {
  selectedToiletCoords.value = currentMapCenter.value
  isPickingToiletMode.value = false // вимикаємо приціл карти
  isAddFormOpen.value = true        // відкриваємо форму заповнення інфи
}

// Крок 3: Сабміт у базу
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

const isAddressSearchOpen = ref(false)
const addressSearchContext = ref<'user' | 'toilet'>('user') // Контекст пошуку

const onMapReady = (mapInstance: any) => {
  L.maplibreGL({
    // style: 'https://tiles.openfreemap.org/styles/positron', // Світла, мінімалістична
    style: 'https://tiles.openfreemap.org/styles/bright', // Дуже детальна, схожа на стандартну
  }).addTo(mapInstance)
}

// Сценарій 1: Пошук адреси для визначення СЕБЕ (зі стартового екрана)
const startAddressSearchForUser = () => {
  showLocationPrompt.value = false
  addressSearchContext.value = 'user'
  isAddressSearchOpen.value = true
}

// Сценарій 2: Пошук адреси для ТОЧКИ ТУАЛЕТУ (із зеленого екрана прицілу)
const handleAddressSearchForToilet = () => {
  addressSearchContext.value = 'toilet'
  isAddressSearchOpen.value = true
}

// Обробка вибору адреси в попапі
const handleAddressSelected = (result: { display_name: string; lat: number; lng: number }) => {
  isAddressSearchOpen.value = false

  // Плавне переміщення карти на знайдені координати
  center.value = [result.lat, result.lng]
  zoom.value = 17 // Робимо сильний зум для точності

  if (addressSearchContext.value === 'user') {
    // Якщо шукали себе — ставимо маркер користувача туди
    userLocation.value = [result.lat, result.lng]
  }
  // Якщо шукали туалет — карта просто переміститься центрированим прицілом на це місце,
  // і користувачу залишиться натиснути "Встановити туалет тут"
}

</script>

<template>
  <main class="relative w-screen h-screen overflow-hidden bg-slate-100">

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

    <l-map v-model:zoom="zoom"
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
          <div class="flex flex-col gap-1 min-w-[150px] font-sans">

            <div v-if="toilet.toilet_images && toilet.toilet_images.length > 0" class="mb-2 -mx-1 -mt-1 overflow-hidden rounded-t-lg">
              <img
                  :src="toilet.toilet_images[0].image_url"
                  class="w-full h-24 object-cover"
                  alt="Фото вбиральні"
              />
            </div>

            <h3 class="font-bold text-slate-800 text-base">
              {{ toilet.type === 'public' ? 'Громадська вбиральня' : 'Біотуалет' }}
            </h3>

            <div v-if="toilet.type === 'public'" class="text-sm text-slate-600 space-y-1">
              <p v-if="toilet.price === 0" class="text-emerald-600 font-semibold">Безкоштовно</p>
              <p v-else>Ціна: {{ toilet.price }} грн</p>

              <p v-if="toilet.work_hours" class="flex items-center gap-1.5 text-slate-500">
                <span class="material-symbols-outlined text-[16px]">schedule</span>
                {{ toilet.work_hours }}
              </p>
            </div>

            <div v-if="toilet.type === 'bio'" class="text-sm space-y-1">
              <p v-if="toilet.is_lock_broken" class="flex items-center gap-1.5 text-red-500 font-medium">
                <span class="material-symbols-outlined text-[16px]">warning</span>
                Замок зламано
              </p>
              <p v-if="toilet.user_comment" class="text-slate-600 italic mt-1">«{{ toilet.user_comment }}»</p>
            </div>

            <div class="flex flex-wrap gap-1.5 mt-2">
              <span v-if="toilet.has_washbasin" class="inline-flex items-center gap-1 bg-blue-50 text-blue-600 text-[11px] font-bold px-2 py-1 rounded-md">
                <span class="material-symbols-outlined text-[14px]">soap</span>
                Рукомийник
              </span>
              <span v-if="toilet.has_wheelchair_accessible" class="inline-flex items-center gap-1 bg-indigo-50 text-indigo-600 text-[11px] font-bold px-2 py-1 rounded-md">
                <span class="material-symbols-outlined text-[14px]">accessible</span>
                Інклюзивна
              </span>
            </div>

            <button class="mt-2 w-full bg-slate-100 text-indigo-600 text-xs font-bold py-1.5 rounded-lg hover:bg-slate-200 transition-colors">
              Детальніше
            </button>
          </div>
        </l-popup>
      </l-marker>
    </l-map>

    <div v-if="isManualSelectionMode" class="absolute inset-0 z-1000 pointer-events-none flex flex-col items-center justify-center">
      <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" class="w-10 h-10 text-indigo-600 drop-shadow-md -mt-10" viewBox="0 0 16 16">
        <path d="M8 16s6-5.686 6-10A6 6 0 0 0 2 6c0 4.314 6 10 6 10zm0-7a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/>
      </svg>
      <button @click="confirmManualLocation" class="mt-4 pointer-events-auto bg-slate-900 text-white px-6 py-3 rounded-full font-medium shadow-xl hover:bg-slate-800 active:scale-95 transition-all">
        Підтвердити моє розташування
      </button>
    </div>

    <div v-if="isPickingToiletMode" class="absolute inset-0 z-1000 pointer-events-none flex flex-col items-center justify-between p-6">

      <div class="bg-slate-900/90 text-white text-xs font-medium px-4 py-2.5 rounded-full shadow-md mt-4 animate-fade-in text-center max-w-xs">
        📍 Перетягніть карту під приціл або використайте швидкі кнопки
      </div>

      <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span class="material-symbols-outlined text-[40px] text-emerald-600 drop-shadow-lg -mt-10">location_on</span>
      </div>

      <div class="w-full max-w-sm flex flex-col gap-4 items-center">

        <div class="flex gap-3 pointer-events-auto">
          <button @click="snapToiletToUserGps" class="flex items-center gap-2 bg-white text-slate-800 text-xs font-semibold px-4 py-2.5 rounded-full shadow-lg hover:bg-slate-50 transition-all">
            <span class="material-symbols-outlined text-[16px] text-emerald-600">my_location</span>
            Я стою біля туалету
          </button>

          <button @click="handleAddressSearchForToilet" class="flex items-center gap-2 bg-white text-slate-800 text-xs font-semibold px-4 py-2.5 rounded-full shadow-lg hover:bg-slate-50 transition-all">
            <span class="material-symbols-outlined text-[16px] text-slate-500">search</span>
            Пошук адреси
          </button>
        </div>

        <div class="flex gap-2 w-full pointer-events-auto bg-white/80 backdrop-blur-md p-3 rounded-2xl shadow-xl border border-slate-100">
        <button @click="confirmToiletLocation" class="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-medium shadow-md hover:bg-emerald-700 transition-all">
          Встановити туалет тут
        </button>
        <button @click="isPickingToiletMode = false" class="px-5 bg-slate-100 text-slate-700 py-3 rounded-xl font-medium hover:bg-slate-200 transition-all">
          Скасувати
        </button>
      </div>

      </div>
    </div>

    <MapControls
        v-show="!isManualSelectionMode && !isPickingToiletMode"
        :is-locating="isLocating"
        @locate="showLocationPrompt = true"
        @add="startPickingToiletLocation"
    />

  </main>

</template>