<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useToast } from 'vue-toastification'
import { toiletService } from "../../services/toiletService.ts"
import BaseButton from "../ui/BaseButton.vue"
import {getThumbnailUrl} from "../utils/imageUtils.ts";
import imageCompression from "browser-image-compression";

const emit = defineEmits(['logout', 'teleport'])

const props = defineProps<{
  focusId?: string | null
}>()

interface Toilet {
  id: string
  type: 'public' | 'bio'
  status: string
  latitude: number
  longitude: number
  address?: string
  work_hours?: string
  price?: number
  stalls_count?: number
  urinals_count?: number
  has_wheelchair_accessible?: boolean
  is_lock_broken?: boolean
  has_washbasin?: boolean
  cleanliness_rating?: number
  user_comment?: string
  moderator_comment?: string
  created_at: string
  toilet_images?: { image_url: string }[]
}

const pendingToilets = ref<Toilet[]>([])
const isLoading = ref(false)
const expandedCardId = ref<string | null>(null)
const toast = useToast()

// --- СТАН РЕДАГУВАННЯ ---
const editingToiletId = ref<string | null>(null)
const editForm = ref<Partial<Toilet>>({})
const isCompressing = ref(false)
const isSaving = ref(false)

// --- ЗМІННІ ДЛЯ ЗРУЧНОГО ВИБОРУ ЧАСУ ---
const openTime = ref('')
const closeTime = ref('')
const is24Hours = ref(false)

// --- СТАН ДЛЯ НОВОГО ФОТО ---
const fileInput = ref<HTMLInputElement | null>(null)
const newImageFile = ref<File | null>(null)
const newImagePreview = ref<string | null>(null)
const editPhotoPreview = ref<string | null>(null)

const onImageSelected = async (event: Event) => {
  const target = event.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    const originalFile = target.files[0]
    const toiletId = editForm.value.id || 'unknown'

    newImagePreview.value = URL.createObjectURL(originalFile)
    isCompressing.value = true

    try {
      const options = {
        maxSizeMB: 0.3,
        maxWidthOrHeight: 1024,
        useWebWorker: true
      }

      const compressedBlob = await imageCompression(originalFile, options)
      const extension = originalFile.name.split('.').pop() || 'jpeg'
      const fileName = `${toiletId}_${Date.now()}.${extension}`

      newImageFile.value = new File([compressedBlob], fileName, {
        type: compressedBlob.type
      })
    } catch (error) {
      console.error('Помилка стиснення зображення в адмінці:', error)
      newImageFile.value = originalFile
    } finally {
      isCompressing.value = false
    }
  }
}

const loadPendingToilets = async () => {
  isLoading.value = true
  try {
    const data = await toiletService.fetchPendingToilets()
    pendingToilets.value = data || []
  } catch (error: any) {
    toast.error('Не вдалося завантажити список заявок.')
  } finally {
    isLoading.value = false
  }
}

watch(() => props.focusId, (newId) => {
  if (newId) {
    expandedCardId.value = newId
    setTimeout(() => {
      const el = document.getElementById(`toilet-card-${newId}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 150)
  }
}, { immediate: true })

const toggleDetails = (id: string) => {
  if (expandedCardId.value === id) expandedCardId.value = null
  else expandedCardId.value = id
}

const handleApprove = async (id: string) => {
  try {
    await toiletService.updateToiletStatus(id, 'approved')
    toast.success('Вбиральню успешно додано на карту!')
    pendingToilets.value = pendingToilets.value.filter(t => t.id !== id)
  } catch (error: any) {
    toast.error('Помилка при затвердженні.')
  }
}

const handleReject = async (id: string) => {
  if (!confirm('Ви впевнені, що хочете відхилити та видалити цю заявку?')) return

  const toiletToDelete = pendingToilets.value.find(t => t.id === id)
  const imageUrls = toiletToDelete?.toilet_images?.map(img => img.image_url) || []

  try {
    await toiletService.deleteToilet(id, imageUrls)
    toast.info('Заявку та пов’язані фото видалено.')
    pendingToilets.value = pendingToilets.value.filter(t => t.id !== id)
  } catch (error: any) {
    toast.error('Помилка при видаленні.')
  }
}

// --- ЛОГІКА РЕДАГУВАННЯ ---
const openEditModal = (toilet: Toilet) => {
  editingToiletId.value = toilet.id
  editForm.value = JSON.parse(JSON.stringify(toilet))

  newImageFile.value = null
  newImagePreview.value = null

  // Розпаршуємо існуючі години роботи для інпутів форми
  const hours = toilet.work_hours || ''
  if (hours === 'Цілодобово') {
    is24Hours.value = true
    openTime.value = ''
    closeTime.value = ''
  } else if (hours.includes(' - ')) {
    is24Hours.value = false
    const parts = hours.split(' - ')
    openTime.value = parts[0] || ''
    closeTime.value = parts[1] || ''
  } else {
    is24Hours.value = false
    openTime.value = ''
    closeTime.value = ''
  }

  if (toilet.toilet_images && toilet.toilet_images.length > 0) {
    editPhotoPreview.value = getThumbnailUrl(toilet.toilet_images[0].image_url)
  } else {
    editPhotoPreview.value = null
  }
}

const closeEditModal = () => {
  editingToiletId.value = null
  editForm.value = {}
  editPhotoPreview.value = null
  newImageFile.value = null
  openTime.value = ''
  closeTime.value = ''
  is24Hours.value = false

  if (newImagePreview.value) {
    URL.revokeObjectURL(newImagePreview.value)
    newImagePreview.value = null
  }
}

const saveEditedToilet = async () => {
  if (!editingToiletId.value) return
  isSaving.value = true

  try {
    if (newImageFile.value) {
      await toiletService.updateToiletImage(editingToiletId.value, newImageFile.value)
    }

    // Формуємо рядок годин роботи перед збереженням
    if (editForm.value.type === 'public') {
      if (is24Hours.value) {
        editForm.value.work_hours = 'Цілодобово'
      } else if (openTime.value && closeTime.value) {
        editForm.value.work_hours = `${openTime.value} - ${closeTime.value}`
      } else {
        editForm.value.work_hours = ''
      }
    } else {
      editForm.value.work_hours = '' // Для біотуалетів зазвичай пусті години
    }

    const updates = {
      type: editForm.value.type as 'public' | 'bio',
      address: editForm.value.address,
      work_hours: editForm.value.work_hours,
      price: editForm.value.price,
      stalls_count: editForm.value.stalls_count,
      urinals_count: editForm.value.urinals_count,
      has_wheelchair_accessible: editForm.value.has_wheelchair_accessible,
      is_lock_broken: editForm.value.is_lock_broken,
      has_washbasin: editForm.value.has_washbasin,
      user_comment: editForm.value.user_comment,
      moderator_comment: editForm.value.moderator_comment
    }

    await toiletService.updateToiletData(editingToiletId.value, updates)
    await loadPendingToilets()

    toast.success('Зміни успішно збережено!')
    closeEditModal()
  } catch (error: any) {
    toast.error('Помилка при збереженні даних.')
    console.error('Повна помилка збереження:', error)
  } finally {
    isSaving.value = false
  }
}

onMounted(() => {
  loadPendingToilets()
})
</script>

<template>
  <div class="relative w-full h-full bg-slate-50 overflow-y-auto px-4 py-20 sm:p-24 flex flex-col items-center">
    <div class="w-full max-w-3xl">

      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 class="text-2xl font-bold text-slate-900">Панель модератора</h1>
          <p class="text-sm text-slate-500 mt-1">Черга перевірки нових локацій вбиралень</p>
        </div>
        <div class="flex items-center gap-3 self-start sm:self-auto">
          <div class="bg-indigo-50 text-indigo-700 font-semibold px-4 py-2 rounded-xl text-sm">
            Очікують: {{ pendingToilets.length }}
          </div>
        </div>
      </div>

      <div v-if="isLoading" class="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
        <span class="material-symbols-outlined text-[32px] animate-spin">sync</span>
        <p class="text-sm">Завантаження заявок...</p>
      </div>

      <div v-else-if="pendingToilets.length === 0" class="bg-white rounded-2xl border border-slate-100 p-8 text-center shadow-sm">
        <span class="material-symbols-outlined text-[48px] text-slate-300 mb-2">done_all</span>
        <h3 class="font-bold text-slate-700 text-lg">Черга порожня</h3>
        <p class="text-slate-400 text-sm mt-1">Усі надіслані користувачами локації вже оброблені.</p>
      </div>

      <div v-else class="flex flex-col gap-5">
        <div
            v-for="toilet in pendingToilets"
            :key="toilet.id"
            :id="'toilet-card-' + toilet.id"
            class="bg-white rounded-2xl border border-slate-100 shadow-sm transition-all hover:shadow-md overflow-hidden flex flex-col"
        >
          <div class="p-5 flex flex-col md:flex-row gap-5">
            <div v-if="toilet.toilet_images && toilet.toilet_images.length > 0" class="w-full md:w-32 h-32 shrink-0 rounded-xl overflow-hidden bg-slate-100 border border-slate-100">
              <img :src="getThumbnailUrl(toilet.toilet_images[0].image_url)" class="w-full h-full object-cover" alt="Фото вбиральні" />
            </div>
            <div v-else class="w-full md:w-32 h-32 shrink-0 rounded-xl flex flex-col items-center justify-center bg-slate-50 border border-slate-100 text-slate-400">
              <span class="material-symbols-outlined text-[32px]">no_photography</span>
              <span class="text-[10px] uppercase font-bold mt-1">Немає фото</span>
            </div>

            <div class="flex-1 min-w-0 flex flex-col justify-center">
              <div class="flex items-center gap-2 mb-2">
                <span class="px-2.5 py-1 text-xs font-bold rounded-lg"
                      :class="toilet.type === 'public' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'">
                  {{ toilet.type === 'public' ? 'Громадська вбиральня' : 'Біотуалет' }}
                </span>
                <span class="text-xs text-slate-400 font-medium">
                  {{ new Date(toilet.created_at).toLocaleDateString('uk-UA') }}
                </span>
              </div>

              <p v-if="toilet.user_comment" class="text-sm text-slate-600 italic mb-3 line-clamp-2">
                «{{ toilet.user_comment }}»
              </p>
              <p class="text-sm text-slate-400 italic mb-3" v-else>Коментар відсутній</p>

              <div class="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500 font-medium mt-auto">
                <span class="flex items-center gap-1.5">
                  <span class="material-symbols-outlined text-[16px] text-indigo-400">pin_drop</span>
                  {{ toilet.latitude.toFixed(5) }}, {{ toilet.longitude.toFixed(5) }}
                </span>
              </div>
            </div>

            <div class="flex flex-col gap-2 shrink-0 w-full md:w-auto border-t md:border-t-0 pt-4 md:pt-0 border-slate-100 justify-center">
              <BaseButton
                  variant="outline"
                  class="py-2! px-4! w-full flex justify-center !text-slate-600 !border-slate-200 hover:!bg-slate-50"
                  @click="toggleDetails(toilet.id)"
              >
                <span class="material-symbols-outlined text-[18px] transition-transform duration-200" :class="{'rotate-180': expandedCardId === toilet.id}">expand_more</span>
                {{ expandedCardId === toilet.id ? 'Сховати деталі' : 'Детальніше' }}
              </BaseButton>

              <BaseButton
                  variant="outline"
                  class="py-2! px-4! w-full flex justify-center bg-indigo-50! border-indigo-100! text-indigo-700! hover:bg-indigo-100!"
                  @click="emit('teleport', toilet.id, toilet.latitude, toilet.longitude)"
              >
                <span class="material-symbols-outlined text-[18px]">my_location</span>
                На карті
              </BaseButton>

              <div class="flex gap-2 w-full mt-auto">
                <BaseButton
                    variant="outline"
                    class="py-2! px-3! flex-1 justify-center !text-blue-600 !border-blue-200 hover:!bg-blue-50"
                    @click="openEditModal(toilet)"
                    title="Редагувати"
                >
                  <span class="material-symbols-outlined text-[18px]">edit</span>
                </BaseButton>

                <BaseButton
                    variant="outline"
                    class="py-2! px-3! flex-1 justify-center !text-red-600 !border-red-200 hover:!bg-red-50"
                    @click="handleReject(toilet.id)"
                    title="Відхилити"
                >
                  <span class="material-symbols-outlined text-[18px]">delete</span>
                </BaseButton>

                <BaseButton
                    variant="success"
                    class="py-2! px-3! flex-[2] justify-center shadow-sm shadow-emerald-100"
                    @click="handleApprove(toilet.id)"
                    title="Підтвердити"
                >
                  <span class="material-symbols-outlined text-[18px]">check_circle</span>
                </BaseButton>
              </div>
            </div>
          </div>

          <div v-show="expandedCardId === toilet.id" class="border-t border-slate-100 bg-slate-50/50 p-5">
            <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Всі параметри заявки</h4>
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-6 text-sm">
              <div v-if="toilet.type === 'public'" class="flex flex-col gap-1">
                <span class="text-slate-500 text-xs font-medium">Вартість</span>
                <span class="text-slate-800 font-semibold flex items-center gap-1.5">
                  <span class="material-symbols-outlined text-[16px] text-emerald-600">payments</span>
                  {{ Number(toilet.price) === 0 ? 'Безкоштовно' : `${toilet.price} грн` }}
                </span>
              </div>
              <div v-if="toilet.work_hours" class="flex flex-col gap-1">
                <span class="text-slate-500 text-xs font-medium">Години роботи</span>
                <span class="text-slate-800 font-semibold flex items-center gap-1.5">
                  <span class="material-symbols-outlined text-[16px] text-blue-500">schedule</span>
                  {{ toilet.work_hours }}
                </span>
              </div>
              <div v-if="toilet.address" class="flex flex-col gap-1 sm:col-span-2 md:col-span-1">
                <span class="text-slate-500 text-xs font-medium">Адреса</span>
                <span class="text-slate-800 font-semibold flex items-center gap-1.5">
                  <span class="material-symbols-outlined text-[16px] text-indigo-400">signpost</span>
                  {{ toilet.address }}
                </span>
              </div>
              <div v-if="toilet.type === 'public' && (toilet.stalls_count || toilet.urinals_count)" class="flex flex-col gap-1">
                <span class="text-slate-500 text-xs font-medium">Місткість</span>
                <div class="flex items-center gap-3">
                  <span v-if="toilet.stalls_count" class="text-slate-800 font-semibold flex items-center gap-1" title="Кабінки">
                    <span class="material-symbols-outlined text-[16px] text-slate-500">door_front</span> {{ toilet.stalls_count }}
                  </span>
                  <span v-if="toilet.urinals_count" class="text-slate-800 font-semibold flex items-center gap-1" title="Пісуари">
                    <span class="material-symbols-outlined text-[16px] text-slate-500">man</span> {{ toilet.urinals_count }}
                  </span>
                </div>
              </div>
            </div>
            <div class="flex flex-wrap gap-2 mt-5 pt-4 border-t border-slate-100 border-dashed">
              <span v-if="toilet.has_wheelchair_accessible" class="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2.5 py-1 rounded-md">
                <span class="material-symbols-outlined text-[14px]">accessible</span> Доступно для візків
              </span>
              <span v-if="toilet.has_washbasin" class="inline-flex items-center gap-1 bg-blue-100 text-blue-800 text-[11px] font-bold px-2.5 py-1 rounded-md">
                <span class="material-symbols-outlined text-[14px]">soap</span> Є рукомийник
              </span>
              <span v-if="toilet.type === 'bio' && toilet.is_lock_broken" class="inline-flex items-center gap-1 bg-red-100 text-red-800 text-[11px] font-bold px-2.5 py-1 rounded-md">
                <span class="material-symbols-outlined text-[14px]">lock_open</span> Замок зламано
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 🛠️ МОДАЛЬНЕ ВІКНО РЕДАГУВАННЯ -->
    <div v-if="editingToiletId" class="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">

        <!-- 1. ШАПКА-ФОТОГРАФІЯ -->
        <div class="relative w-full h-48 sm:h-56 bg-slate-100 group border-b border-slate-100">
          <img v-if="newImagePreview || editPhotoPreview"
               :src="newImagePreview || editPhotoPreview || undefined"
               class="w-full h-full object-cover"
               alt="Фото локації" />

          <div v-else class="w-full h-full flex flex-col items-center justify-center text-slate-400">
            <span class="material-symbols-outlined text-[48px] mb-2 opacity-50">add_a_photo</span>
            <span class="text-sm font-semibold tracking-wide uppercase">Фото відсутнє</span>
          </div>

          <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
               @click="fileInput?.click()">
            <span class="bg-white/20 backdrop-blur-md border border-white/30 text-white font-medium px-4 py-2 rounded-xl flex items-center gap-2 shadow-lg">
              <span class="material-symbols-outlined text-[20px]">upload</span>
              {{ (newImagePreview || editForm.toilet_images?.length) ? 'Змінити фотографію' : 'Завантажити фото' }}
            </span>
          </div>

          <input type="file" accept="image/*" class="hidden" ref="fileInput" @change="onImageSelected" />

          <button @click="closeEditModal" class="absolute top-4 right-4 w-8 h-8 bg-black/30 hover:bg-black/50 text-white rounded-full flex items-center justify-center backdrop-blur-md transition-colors shadow-sm">
            <span class="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <!-- 2. СКРОЛ-ЗОНА З ІНПУТАМИ -->
        <div class="p-5 overflow-y-auto custom-scrollbar flex flex-col gap-5 bg-white text-sm">
          <div>
            <h2 class="text-lg font-bold text-slate-800">Редагування локації</h2>
            <p class="text-[11px] font-medium text-slate-500 mt-1">Виправте дані перед публікацією на карту</p>
          </div>

          <!-- Перемикач типу вбиральні -->
          <div class="flex p-1 bg-slate-100 rounded-xl">
            <button
                @click="editForm.type = 'public'"
                :class="['flex-1 py-2 rounded-lg font-medium transition-all', editForm.type === 'public' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500']"
            >
              Громадська
            </button>
            <button
                @click="editForm.type = 'bio'"
                :class="['flex-1 py-2 rounded-lg font-medium transition-all', editForm.type === 'bio' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500']"
            >
              Біотуалет
            </button>
          </div>

          <!-- Блок чекбоксів зручностей -->
          <div class="space-y-3">
            <label class="flex items-center gap-3 p-3 border-2 border-slate-100 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors select-none">
              <input type="checkbox" v-model="editForm.has_washbasin" class="w-5 h-5 accent-indigo-600">
              <span class="text-sm font-medium text-slate-700">Можна помити руки?</span>
            </label>

            <label v-if="editForm.type === 'public'" class="flex items-center gap-3 p-3 border-2 border-slate-100 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors select-none">
              <input type="checkbox" v-model="editForm.has_wheelchair_accessible" class="w-5 h-5 accent-indigo-600">
              <span class="text-sm font-medium text-slate-700">Облаштовано для людей з інвалідністю?</span>
            </label>

            <label v-if="editForm.type === 'bio'" class="flex items-center gap-3 p-3 border-2 border-red-50 border-dashed rounded-xl cursor-pointer hover:bg-red-50/50 transition-colors select-none">
              <input type="checkbox" v-model="editForm.is_lock_broken" class="w-5 h-5 accent-red-500">
              <span class="text-sm font-medium text-slate-700 text-red-600">Зламани замок?</span>
            </label>
          </div>

          <!-- Специфічні поля для громадського типу -->
          <div v-if="editForm.type === 'public'" class="flex flex-col gap-4 animate-fade-in">
            <div class="flex flex-col gap-1">
              <span class="text-[10px] uppercase font-bold text-slate-400 ml-1">Ціна (грн)</span>
              <input type="number" v-model.number="editForm.price" class="p-3 bg-slate-50 rounded-xl text-sm focus:outline-indigo-600 transition-colors">
            </div>

            <!-- ВСТАВЛЕНО СТИЛЬ ГОДИН РОБОТИ З ОРИГІНАЛУ -->
            <div class="flex flex-col gap-1">
              <span class="text-[10px] uppercase font-bold text-slate-400 ml-1">Години роботи</span>
              <div class="flex items-center gap-2">
                <input type="time" v-model="openTime" :disabled="is24Hours" class="w-full p-3 bg-slate-50 rounded-xl text-sm focus:outline-indigo-600 transition-colors disabled:opacity-50">
                <span class="text-slate-400 font-bold">—</span>
                <input type="time" v-model="closeTime" :disabled="is24Hours" class="w-full p-3 bg-slate-50 rounded-xl text-sm focus:outline-indigo-600 transition-colors disabled:opacity-50">
              </div>
              <label class="flex items-center gap-2 mt-1.5 ml-1 cursor-pointer select-none">
                <input type="checkbox" v-model="is24Hours" class="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500">
                <span class="text-xs font-medium text-slate-600">Цілодобово</span>
              </label>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div class="flex flex-col gap-2">
                <span class="text-[10px] uppercase font-bold text-slate-400 ml-1">Кількість кабінок</span>
                <div class="flex items-center bg-slate-50 rounded-xl px-3 py-1 border-2 border-transparent focus-within:border-indigo-600 transition-colors">
                  <span class="material-symbols-outlined text-slate-400 text-[20px] mr-2">door_front</span>
                  <input type="number" v-model.number="editForm.stalls_count" min="0" class="w-full bg-transparent p-2 text-sm focus:outline-none" />
                </div>
              </div>

              <div class="flex flex-col gap-2">
                <span class="text-[10px] uppercase font-bold text-slate-400 ml-1">Кількість пісуарів</span>
                <div class="flex items-center bg-slate-50 rounded-xl px-3 py-1 border-2 border-transparent focus-within:border-indigo-600 transition-colors">
                  <span class="material-symbols-outlined text-slate-400 text-[20px] mr-2">man</span>
                  <input type="number" v-model.number="editForm.urinals_count" min="0" class="w-full bg-transparent p-2 text-sm focus:outline-none" />
                </div>
              </div>
            </div>
          </div>

          <!-- Адреса / Орієнтир -->
          <div class="flex flex-col gap-1">
            <span class="text-[10px] uppercase font-bold text-slate-400 ml-1">Адреса / Орієнтир</span>
            <input type="text" v-model="editForm.address" class="p-3 bg-slate-50 rounded-xl text-sm focus:outline-indigo-600 transition-colors" />
          </div>

          <!-- Коментар користувача -->
          <div class="flex flex-col gap-2">
            <span class="text-[10px] uppercase font-bold text-slate-400 ml-1">Коментар користувача</span>
            <textarea
                v-model="editForm.user_comment"
                rows="2"
                class="p-3 bg-slate-50 rounded-xl text-sm focus:outline-indigo-600 resize-none transition-colors"
            ></textarea>
          </div>

          <!-- Нотатка модератора -->
          <div class="flex flex-col gap-2">
            <span class="text-[10px] uppercase font-bold text-indigo-500 ml-1">Нотатка модератора (внутрішня)</span>
            <textarea
                v-model="editForm.moderator_comment"
                placeholder="Напишіть, що ви змінили..."
                rows="2"
                class="p-3 bg-indigo-50/50 rounded-xl text-sm focus:outline-indigo-600 resize-none transition-colors"
            ></textarea>
          </div>
        </div>

        <!-- 3. ФУТЕР З КНОПКАМИ -->
        <div class="p-4 border-t border-slate-100 bg-slate-50 flex flex-col gap-2 shrink-0">
          <BaseButton
              variant="primary"
              @click="saveEditedToilet"
              :disabled="isSaving || isCompressing"
          >
            <span v-if="isSaving || isCompressing" class="material-symbols-outlined text-[20px] animate-spin mr-1">sync</span>
            {{ isSaving ? 'Збереження...' : isCompressing ? 'Обробка photo...' : 'Зберегти зміни' }}
          </BaseButton>
          <BaseButton variant="ghost" @click="closeEditModal" :disabled="isSaving">
            Скасувати
          </BaseButton>
        </div>

      </div>
    </div>

  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 10px;
}
</style>