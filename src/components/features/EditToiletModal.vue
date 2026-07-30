<script setup lang="ts">
import { ref, watch } from 'vue'
import { useToast } from 'vue-toastification'
import { toiletService } from '../../services/toiletService.ts'
import BaseModal from '../ui/BaseModal.vue'
import BaseButton from '../ui/BaseButton.vue'
import { getThumbnailUrl } from '../utils/imageUtils.ts'
import imageCompression from 'browser-image-compression'
import type { Toilet } from '../../types.ts'

const props = defineProps<{
  isOpen: boolean
  toilet: Toilet | null
}>()

const emit = defineEmits(['close', 'saved'])
const toast = useToast()

// Стейт форми
const editForm = ref<Partial<Toilet>>({})
const isCompressing = ref(false)
const isSaving = ref(false)

// Змінні для годин
const openTime = ref('')
const closeTime = ref('')
const is24Hours = ref(false)

// Змінні для фото
const fileInput = ref<HTMLInputElement | null>(null)
const newImageFile = ref<File | null>(null)
const newImagePreview = ref<string | null>(null)
const editPhotoPreview = ref<string | null>(null)

// Безпечне перетворення значення на число або null (для Supabase)
const parseSafeNumber = (value: any): number | null => {
  if (value === null || value === undefined || value === '') return null
  const num = Number(value)
  return isNaN(num) ? null : num
}

// Слідкуємо за відкриттям модалки та ініціалізуємо дані
watch(() => props.isOpen, (newVal) => {
  if (newVal && props.toilet) {
    editForm.value = JSON.parse(JSON.stringify(props.toilet))

    newImageFile.value = null
    newImagePreview.value = null

    // Парсинг годин роботи
    const hours = props.toilet.work_hours || ''
    if (hours.toLowerCase() === 'цілодобово') {
      is24Hours.value = true
      openTime.value = ''
      closeTime.value = ''
    } else if (hours.includes('-')) {
      is24Hours.value = false
      const parts = hours.split('-').map(p => p.trim())
      openTime.value = parts[0] || ''
      closeTime.value = parts[1] || ''
    } else {
      is24Hours.value = false
      openTime.value = ''
      closeTime.value = ''
    }

    if (props.toilet.toilet_images && props.toilet.toilet_images.length > 0) {
      editPhotoPreview.value = getThumbnailUrl(props.toilet.toilet_images[0].image_url)
    } else {
      editPhotoPreview.value = null
    }
  }
})

const closeModal = () => {
  if (newImagePreview.value) {
    URL.revokeObjectURL(newImagePreview.value)
  }
  emit('close')
}

const onImageSelected = async (event: Event) => {
  const target = event.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    const originalFile = target.files[0]
    const toiletId = editForm.value.id || 'unknown'

    newImagePreview.value = URL.createObjectURL(originalFile)
    isCompressing.value = true

    try {
      const options = { maxSizeMB: 0.3, maxWidthOrHeight: 1024, useWebWorker: true }
      const compressedBlob = await imageCompression(originalFile, options)
      const extension = originalFile.name.split('.').pop() || 'jpeg'
      const fileName = `${toiletId}_${Date.now()}.${extension}`

      newImageFile.value = new File([compressedBlob], fileName, { type: compressedBlob.type })
    } catch (error) {
      console.error('Помилка стиснення:', error)
      newImageFile.value = originalFile
    } finally {
      isCompressing.value = false
    }
  }
}

const saveEditedToilet = async () => {
  if (!editForm.value.id) return
  isSaving.value = true

  try {
    if (newImageFile.value) {
      await toiletService.updateToiletImage(editForm.value.id, newImageFile.value)
    }

    // Форматування годин роботи перед збереженням
    if (editForm.value.type === 'public') {
      if (is24Hours.value) {
        editForm.value.work_hours = 'Цілодобово'
      } else if (openTime.value && closeTime.value) {
        editForm.value.work_hours = `${openTime.value} - ${closeTime.value}`
      } else {
        editForm.value.work_hours = ''
      }
    } else {
      editForm.value.work_hours = ''
    }

    // Збираємо дані з безпечним парсингом чисел
    const updates = {
      type: editForm.value.type as 'public' | 'bio',
      address: editForm.value.address,
      work_hours: editForm.value.work_hours,

      price: parseSafeNumber(editForm.value.price),
      stalls_count: parseSafeNumber(editForm.value.stalls_count),
      urinals_count: parseSafeNumber(editForm.value.urinals_count),

      has_wheelchair_accessible: !!editForm.value.has_wheelchair_accessible,
      is_lock_broken: !!editForm.value.is_lock_broken,
      has_washbasin: !!editForm.value.has_washbasin,

      user_comment: editForm.value.user_comment,
      moderator_comment: editForm.value.moderator_comment
    }

    await toiletService.updateToiletData(editForm.value.id, updates)

    toast.success('Зміни успішно збережено!')
    emit('saved')
    closeModal()
  } catch (error: any) {
    toast.error('Помилка при збереженні даних.')
    console.error(error)
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <BaseModal :is-open="isOpen" @close="closeModal">
    <!-- 1. ШАПКА-ФОТОГРАФІЯ -->
    <div class="relative w-full h-48 sm:h-56 bg-slate-100 group border-b border-slate-100 shrink-0">
      <img v-if="newImagePreview || editPhotoPreview" :src="newImagePreview || editPhotoPreview || undefined" class="w-full h-full object-cover" alt="Фото локації" />
      <div v-else class="w-full h-full flex flex-col items-center justify-center text-slate-400">
        <span class="material-symbols-outlined text-[48px] mb-2 opacity-50">add_a_photo</span>
        <span class="text-sm font-semibold tracking-wide uppercase">Фото відсутнє</span>
      </div>
      <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer" @click="fileInput?.click()">
        <span class="bg-white/20 backdrop-blur-md border border-white/30 text-white font-medium px-4 py-2 rounded-xl flex items-center gap-2 shadow-lg">
          <span class="material-symbols-outlined text-[20px]">upload</span>
          {{ (newImagePreview || editPhotoPreview) ? 'Змінити фотографію' : 'Завантажити фото' }}
        </span>
      </div>
      <input type="file" accept="image/*" class="hidden" ref="fileInput" @change="onImageSelected" />
      <button @click="closeModal" class="absolute top-4 right-4 w-8 h-8 bg-black/30 hover:bg-black/50 text-white rounded-full flex items-center justify-center backdrop-blur-md transition-colors shadow-sm cursor-pointer">
        <span class="material-symbols-outlined text-[18px]">close</span>
      </button>
    </div>

    <!-- 2. СКРОЛ-ЗОНА З ІНПУТАМИ -->
    <div class="p-5 overflow-y-auto custom-scrollbar flex flex-col gap-5 bg-white">

      <div>
        <h2 class="text-xl font-bold text-slate-800">Редагування локації</h2>
        <p class="text-sm text-slate-500 mt-1">Виправте дані перед публікацією на мапу</p>
      </div>

      <!-- Перемикач типу вбиральні -->
      <div class="flex flex-col gap-2">
        <span class="text-[10px] uppercase font-bold text-slate-400 ml-1">Тип туалету</span>
        <div class="flex p-1 bg-slate-100 rounded-xl">
        <button
            type="button"
            @click="editForm.type = 'public'"
            :class="['flex-1 py-2 rounded-lg font-medium transition-all', editForm.type === 'public' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500']"
        >
          Громадська
        </button>
        <button
            type="button"
            @click="editForm.type = 'bio'"
            :class="['flex-1 py-2 rounded-lg font-medium transition-all', editForm.type === 'bio' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500']"
        >
          Біотуалет
        </button>
        </div>
      </div>

      <!-- Адреса -->
      <div class="flex flex-col gap-1">
        <span class="text-[10px] uppercase font-bold text-slate-400 ml-1">Адреса</span>
        <input
            type="text"
            v-model="editForm.address"
            placeholder="Введіть адресу (напр., вул. Центральна, 1)"
            class="p-3 bg-slate-50 rounded-xl text-sm focus:outline-indigo-600 transition-colors"
        />
      </div>

      <!-- Чекбокси (Особливості) -->
      <div class="flex flex-col gap-2">
        <span class="text-[10px] uppercase font-bold text-slate-400 ml-1">Особливості</span>

        <label class="flex items-center gap-3 p-3 border-2 border-slate-100 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
          <input type="checkbox" v-model="editForm.has_washbasin" class="w-5 h-5 accent-indigo-600">
          <span class="text-sm font-medium text-slate-700">Можна помити руки?</span>
        </label>

        <label v-if="editForm.type === 'public'" class="flex items-center gap-3 p-3 border-2 border-slate-100 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
          <input type="checkbox" v-model="editForm.has_wheelchair_accessible" class="w-5 h-5 accent-indigo-600">
          <span class="text-sm font-medium text-slate-700">Облаштовано для людей з інвалідністю?</span>
        </label>

        <label v-if="editForm.type === 'bio'" class="flex items-center gap-3 p-3 border-2 border-red-50 border-dashed rounded-xl cursor-pointer hover:bg-red-50/50 transition-colors">
          <input type="checkbox" v-model="editForm.is_lock_broken" class="w-5 h-5 accent-red-500">
          <span class="text-sm font-medium text-slate-700 text-red-600">Зламаний замок?</span>
        </label>
      </div>

      <!-- Додаткові поля тільки для громадських вбиралень -->
      <div v-if="editForm.type === 'public'" class="flex flex-col gap-4 animate-fade-in">

        <!-- Вартість -->
        <div class="flex flex-col gap-1">
          <span class="text-[10px] uppercase font-bold text-slate-400 ml-1">Вартість (грн)</span>
          <input
              type="number"
              min="0"
              v-model="editForm.price"
              placeholder="0 = безкоштовно"
              class="p-3 bg-slate-50 rounded-xl text-sm focus:outline-indigo-600 transition-colors"
          />
        </div>

        <!-- Години роботи -->
        <div class="flex flex-col gap-2">
          <span class="text-[10px] uppercase font-bold text-slate-400 ml-1">Години роботи</span>

          <label class="flex items-center gap-3 p-3 border-2 border-slate-100 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors mb-1">
            <input type="checkbox" v-model="is24Hours" class="w-5 h-5 accent-indigo-600" />
            <span class="text-sm font-medium text-slate-700">Цілодобово</span>
          </label>

          <div v-if="!is24Hours" class="flex items-center gap-2">
            <input type="time" v-model="openTime" class="w-full p-3 bg-slate-50 rounded-xl text-sm focus:outline-indigo-600 transition-colors" />
            <span class="text-slate-400 font-bold">—</span>
            <input type="time" v-model="closeTime" class="w-full p-3 bg-slate-50 rounded-xl text-sm focus:outline-indigo-600 transition-colors" />
          </div>
        </div>

        <!-- Кількість кабінок та пісуарів -->
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-2">
            <span class="text-[10px] uppercase font-bold text-slate-400 ml-1">Кількість кабінок</span>
            <div class="flex items-center bg-slate-50 rounded-xl px-3 py-1 border-2 border-transparent focus-within:border-indigo-600 transition-colors">
              <span class="material-symbols-outlined text-slate-400 text-[20px] mr-2">door_front</span>
              <input type="number" v-model.number="editForm.stalls_count" min="0" placeholder="0" class="w-full bg-transparent p-2 text-sm focus:outline-none" />
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <span class="text-[10px] uppercase font-bold text-slate-400 ml-1">Кількість пісуарів</span>
            <div class="flex items-center bg-slate-50 rounded-xl px-3 py-1 border-2 border-transparent focus-within:border-indigo-600 transition-colors">
              <span class="material-symbols-outlined text-slate-400 text-[20px] mr-2">man</span>
              <input type="number" v-model.number="editForm.urinals_count" min="0" placeholder="0" class="w-full bg-transparent p-2 text-sm focus:outline-none" />
            </div>
          </div>
        </div>

      </div>

      <!-- Нотатка модератора -->
      <div class="flex flex-col gap-1">
        <span class="text-[10px] uppercase font-bold text-slate-400 ml-1">Нотатка модератора</span>
        <textarea
            v-model="editForm.moderator_comment"
            rows="2"
            placeholder="Службовий коментар (необов'язково)..."
            class="p-3 bg-slate-50 rounded-xl text-sm focus:outline-indigo-600 resize-none transition-colors"
        ></textarea>
      </div>

    </div>

    <!-- 3. ФУТЕР З КНОПКАМИ -->
    <div class="p-4 border-t border-slate-100 bg-slate-50 flex gap-3 justify-end shrink-0">
      <BaseButton variant="outline" class="py-2.5! px-5!" @click="closeModal" :disabled="isSaving">
        Скасувати
      </BaseButton>
      <BaseButton variant="primary" class="py-2.5! px-6! shadow-md shadow-indigo-200" @click="saveEditedToilet" :disabled="isSaving || isCompressing">
        <span v-if="isSaving || isCompressing" class="material-symbols-outlined text-[20px] animate-spin mr-1">sync</span>
        {{ isSaving ? 'Збереження...' : isCompressing ? 'Обробка фото...' : 'Зберегти зміни' }}
      </BaseButton>
    </div>
  </BaseModal>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
</style>