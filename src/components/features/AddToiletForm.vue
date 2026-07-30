<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import BaseModal from '../ui/BaseModal.vue'
import BaseButton from '../ui/BaseButton.vue'
import { type ToiletFormData, validateToiletForm } from "../utils/validators.ts"
import imageCompression from 'browser-image-compression'
import { useToast } from "vue-toastification";

const fileInput = ref<HTMLInputElement | null>(null)
const toast = useToast()

const triggerFileInput = () => {
  fileInput.value?.click()
}

const props = defineProps<{
  isOpen: boolean,
  coords: [number, number] | null
}>()

const emit = defineEmits(['close', 'submit'])

const form = reactive<ToiletFormData>({
  type: 'public',
  has_washbasin: false,
  has_wheelchair_accessible: false,
  price: 0,
  work_hours: '',
  stalls_count: 1,
  urinals_count: 0,
  is_lock_broken: false,
  comment: ''
})

const photoPreview = ref<string | null>(null)
const rawFile = ref<File | null>(null)

// Змінні для зручного вибору часу
const openTime = ref('')
const closeTime = ref('')
const is24Hours = ref(false)

// Очищення форми при закритті/відкритті або успішній відправці
const resetForm = () => {
  photoPreview.value = null
  rawFile.value = null
  if (fileInput.value) fileInput.value.value = ''

  form.type = 'public'
  form.has_washbasin = false
  form.has_wheelchair_accessible = false
  form.is_lock_broken = false
  form.work_hours = ''
  form.price = 0
  form.comment = ''
  form.stalls_count = 1
  form.urinals_count = 0

  openTime.value = ''
  closeTime.value = ''
  is24Hours.value = false
}

// Скидаємо стан тільки тоді, коли модалка закривається
watch(() => props.isOpen, (newVal) => {
  if (!newVal) {
    resetForm()
  }
})

const handlePhotoUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement
  if (target.files && target.files[0]) {
    const originalFile = target.files[0]

    const reader = new FileReader()
    reader.onload = (e) => {
      photoPreview.value = e.target?.result as string
    }
    reader.readAsDataURL(originalFile)

    try {
      const options = {
        maxSizeMB: 0.3,
        maxWidthOrHeight: 1024,
        useWebWorker: true
      }
      rawFile.value = await imageCompression(originalFile, options)
    } catch (error) {
      console.error('Помилка стиснення зображення:', error)
      rawFile.value = originalFile
    }
  }
}

const handleClose = () => {
  emit('close')
}

const submitForm = () => {
  if (!props.coords) {
    toast.error('Не вдалося визначити точні координати точки. Спробуйте ще раз.')
    return
  }

  if (form.type === 'public') {
    if (is24Hours.value) {
      form.work_hours = 'Цілодобово'
    } else if (openTime.value && closeTime.value) {
      form.work_hours = `${openTime.value} - ${closeTime.value}`
    } else {
      form.work_hours = ''
    }
  }

  const errorMessage = validateToiletForm(form, !!photoPreview.value)
  if (errorMessage) {
    toast.error(errorMessage)
    return
  }

  emit('submit', {
    ...form,
    coords: props.coords,
    imageFile: rawFile.value
  })

  handleClose()
}
</script>

<template>
  <BaseModal :is-open="isOpen" @close="handleClose">

    <div class="p-5 border-b border-slate-100 bg-white text-center">
      <h2 class="text-lg font-bold text-slate-800">Додати нову вбиральню</h2>
      <p class="text-slate-500 text-[11px] font-medium mt-1">
        Координати: {{ coords?.[0].toFixed(5) }}, {{ coords?.[1].toFixed(5) }}
      </p>
    </div>

    <div class="p-5 overflow-y-auto custom-scrollbar flex flex-col gap-5 bg-white">
      <!-- Тип туалету -->
      <div class="flex flex-col gap-2">
        <span class="text-[10px] uppercase font-bold text-slate-400 ml-1">Тип туалету</span>
        <div class="flex p-1 bg-slate-100 rounded-xl">
          <button
              type="button"
              @click="form.type = 'public'"
              :class="['flex-1 py-2 rounded-lg font-medium transition-all', form.type === 'public' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500']"
          >
            Громадська
          </button>
          <button
              type="button"
              @click="form.type = 'bio'"
              :class="['flex-1 py-2 rounded-lg font-medium transition-all', form.type === 'bio' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500']"
          >
            Біотуалет
          </button>
        </div>
      </div>

      <!-- Особливості -->
      <div class="flex flex-col gap-2">
        <span class="text-[10px] uppercase font-bold text-slate-400 ml-1">Особливості</span>
        <label class="flex items-center gap-3 p-3 border-2 border-slate-100 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
          <input type="checkbox" v-model="form.has_washbasin" class="w-5 h-5 accent-indigo-600">
          <span class="text-sm font-medium text-slate-700">Можна помити руки?</span>
        </label>

        <label v-if="form.type === 'public'" class="flex items-center gap-3 p-3 border-2 border-slate-100 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
          <input type="checkbox" v-model="form.has_wheelchair_accessible" class="w-5 h-5 accent-indigo-600">
          <span class="text-sm font-medium text-slate-700">Облаштовано для людей з інвалідністю?</span>
        </label>

        <label v-if="form.type === 'bio'" class="flex items-center gap-3 p-3 border-2 border-red-50 border-dashed rounded-xl cursor-pointer hover:bg-red-50/50 transition-colors">
          <input type="checkbox" v-model="form.is_lock_broken" class="w-5 h-5 accent-red-500">
          <span class="text-sm font-medium text-red-600">Зламаний замок?</span>
        </label>
      </div>

      <!-- Поля для громадського туалету -->
      <div v-if="form.type === 'public'" class="flex flex-col gap-4">

        <div class="flex flex-col gap-1">
          <span class="text-[10px] uppercase font-bold text-slate-400 ml-1">Вартість (грн)</span>
          <input type="number" min="0" v-model="form.price" class="p-3 bg-slate-50 rounded-xl text-sm focus:outline-indigo-600 transition-colors">
        </div>

        <div class="flex flex-col gap-1">
          <div class="flex items-center justify-between ml-1 mb-1">
            <span class="text-[10px] uppercase font-bold text-slate-400">Години роботи</span>
            <label class="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" v-model="is24Hours" class="w-4 h-4 accent-indigo-600 rounded">
              <span class="text-xs text-slate-600 font-medium">Цілодобово</span>
            </label>
          </div>

          <div class="flex items-center gap-2" :class="{ 'opacity-50 pointer-events-none': is24Hours }">
            <input type="time" v-model="openTime" :disabled="is24Hours" class="w-full p-3 bg-slate-50 rounded-xl text-sm focus:outline-indigo-600 transition-colors">
            <span class="text-slate-400 font-bold">—</span>
            <input type="time" v-model="closeTime" :disabled="is24Hours" class="w-full p-3 bg-slate-50 rounded-xl text-sm focus:outline-indigo-600 transition-colors">
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-2">
            <span class="text-[10px] uppercase font-bold text-slate-400 ml-1">Кабінки</span>
            <div class="flex items-center bg-slate-50 rounded-xl px-3 py-1 border-2 border-transparent focus-within:border-indigo-600 transition-colors">
              <span class="material-symbols-outlined text-slate-400 text-[20px] mr-2">door_front</span>
              <input type="number" v-model.number="form.stalls_count" min="1" class="w-full bg-transparent p-2 text-sm focus:outline-none" />
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <span class="text-[10px] uppercase font-bold text-slate-400 ml-1">Пісуари</span>
            <div class="flex items-center bg-slate-50 rounded-xl px-3 py-1 border-2 border-transparent focus-within:border-indigo-600 transition-colors">
              <span class="material-symbols-outlined text-slate-400 text-[20px] mr-2">man</span>
              <input type="number" v-model.number="form.urinals_count" min="0" class="w-full bg-transparent p-2 text-sm focus:outline-none" />
            </div>
          </div>
        </div>

      </div>

      <!-- Фото -->
      <div class="flex flex-col gap-2">
        <span class="text-[10px] uppercase font-bold text-slate-400 ml-1">Фото вбиральні</span>
        <div
            @click="triggerFileInput"
            class="relative h-40 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center overflow-hidden cursor-pointer hover:bg-slate-100 transition-colors"
        >
          <img v-if="photoPreview" :src="photoPreview" class="absolute inset-0 w-full h-full object-cover" />
          <div v-else class="flex flex-col items-center gap-2 text-slate-400">
            <span class="material-symbols-outlined text-[32px]">add_a_photo</span>
            <span class="text-xs font-medium">Натисніть, щоб додати фото</span>
          </div>
          <input type="file" ref="fileInput" class="hidden" accept="image/*" @change="handlePhotoUpload">
        </div>
      </div>

      <!-- Коментар -->
      <div class="flex flex-col gap-2">
        <span class="text-[10px] uppercase font-bold text-slate-400 ml-1">Коментар / Орієнтир</span>
        <textarea
            v-model="form.comment"
            placeholder="Наприклад: за залізничним вокзалом..."
            rows="2"
            class="p-3 bg-slate-50 rounded-xl text-sm focus:outline-indigo-600 resize-none transition-colors"
        ></textarea>
      </div>

    </div>

    <!-- Кнопки в один рядок -->
    <div class="p-4 border-t border-slate-100 bg-slate-50 flex gap-2">
      <BaseButton variant="ghost" class="flex-1" @click="handleClose">
        Скасувати
      </BaseButton>
      <BaseButton variant="primary" class="flex-1" @click="submitForm">
        Надіслати
      </BaseButton>
    </div>

  </BaseModal>
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