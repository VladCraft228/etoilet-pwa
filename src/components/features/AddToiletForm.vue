<script setup lang="ts">
import {reactive, ref} from 'vue'
import BaseModal from '../ui/BaseModal.vue'
import BaseButton from '../ui/BaseButton.vue'
import {type ToiletFormData, validateToiletForm} from "../utils/validators.ts"

// Створюємо посилання на прихований інпут
const fileInput = ref<HTMLInputElement | null>(null)

// Безпечна функція виклику діалогу вибору файлу
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

const handlePhotoUpload = (event: Event) => {
  const target = event.target as HTMLInputElement
  if (target.files && target.files[0]) {
    rawFile.value = target.files[0]

    const reader = new FileReader()
    reader.onload = (e) => {
      photoPreview.value = e.target?.result as string
    }
    reader.readAsDataURL(target.files[0])
  }
}

// Змінні для зручного вибору часу
const openTime = ref('')
const closeTime = ref('')
const is24Hours = ref(false)

const submitForm = () => {
  if (!props.coords) {
    alert('Не вдалося визначити координати точки.')
    return
  }

  // ФОРМУЄМО ГОДИНИ РОБОТИ ПЕРЕД ВІДПРАВКОЮ
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
    alert(errorMessage)
    return
  }

  emit('submit', {
    ...form,
    coords: props.coords,
    imageFile: rawFile.value
  })

  // Очищення полів
  photoPreview.value = null
  rawFile.value = null
  form.work_hours = ''
  openTime.value = ''
  closeTime.value = ''
  is24Hours.value = false
  form.price = 0
  form.comment = ''
  form.stalls_count = 1
  form.urinals_count = 0
}
</script>

<template>
  <BaseModal :is-open="isOpen" @close="emit('close')">

    <div class="p-5 border-b border-slate-100 bg-white text-center">
      <h2 class="text-lg font-bold text-slate-800">Додати нову вбиральню</h2>
      <p class="text-slate-500 text-[11px] font-medium mt-1">Координати: {{ coords?.[0].toFixed(5) }}, {{ coords?.[1].toFixed(5) }}</p>
    </div>

    <div class="p-5 overflow-y-auto custom-scrollbar flex flex-col gap-5 bg-white">

      <div class="flex p-1 bg-slate-100 rounded-xl">
        <button
            @click="form.type = 'public'"
            :class="['flex-1 py-2 rounded-lg font-medium transition-all', form.type === 'public' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500']"
        >
          Громадська
        </button>
        <button
            @click="form.type = 'bio'"
            :class="['flex-1 py-2 rounded-lg font-medium transition-all', form.type === 'bio' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500']"
        >
          Біотуалет
        </button>
      </div>

      <div class="space-y-3">
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
          <span class="text-sm font-medium text-slate-700 text-red-600">Зламаний замок?</span>
        </label>
      </div>

      <div v-if="form.type === 'public'" class="flex flex-col gap-4 animate-fade-in">

        <div class="flex flex-col gap-1">
          <span class="text-[10px] uppercase font-bold text-slate-400 ml-1">Ціна (грн)</span>
          <input type="number" v-model="form.price" class="p-3 bg-slate-50 rounded-xl text-sm focus:outline-indigo-600 transition-colors">
        </div>

        <div class="flex flex-col gap-1">
          <span class="text-[10px] uppercase font-bold text-slate-400 ml-1">Години роботи</span>
          <div class="flex items-center gap-2">
            <input type="time" v-model="openTime" class="w-full p-3 bg-slate-50 rounded-xl text-sm focus:outline-indigo-600 transition-colors">
            <span class="text-slate-400 font-bold">—</span>
            <input type="time" v-model="closeTime" class="w-full p-3 bg-slate-50 rounded-xl text-sm focus:outline-indigo-600 transition-colors">
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-2">
            <span class="text-[10px] uppercase font-bold text-slate-400 ml-1">Кількість кабінок</span>
            <div class="flex items-center bg-slate-50 rounded-xl px-3 py-1 border-2 border-transparent focus-within:border-indigo-600 transition-colors">
              <span class="material-symbols-outlined text-slate-400 text-[20px] mr-2">door_front</span>
              <input type="number" v-model.number="form.stalls_count" min="1" class="w-full bg-transparent p-2 text-sm focus:outline-none" />
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <span class="text-[10px] uppercase font-bold text-slate-400 ml-1">Кількість пісуарів</span>
            <div class="flex items-center bg-slate-50 rounded-xl px-3 py-1 border-2 border-transparent focus-within:border-indigo-600 transition-colors">
              <span class="material-symbols-outlined text-slate-400 text-[20px] mr-2">man</span>
              <input type="number" v-model.number="form.urinals_count" min="0" class="w-full bg-transparent p-2 text-sm focus:outline-none" />
            </div>
          </div>
        </div>

      </div>

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

      <div class="flex flex-col gap-2">
        <span class="text-[10px] uppercase font-bold text-slate-400 ml-1">Коментар / Орієнтир</span>
        <textarea
            v-model="form.comment"
            placeholder="Наприклад: за залізничним вокзалом, або біля кав'ярні..."
            rows="2"
            class="p-3 bg-slate-50 rounded-xl text-sm focus:outline-indigo-600 resize-none transition-colors"
        ></textarea>
      </div>

    </div>

    <div class="p-4 border-t border-slate-100 bg-slate-50 flex flex-col gap-2">
      <BaseButton variant="primary" @click="submitForm">
        Надіслати на модерацію
      </BaseButton>
      <BaseButton variant="ghost" @click="emit('close')">
        Скасувати
      </BaseButton>
    </div>

  </BaseModal>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #cbd5e1; /* Трохи темніший колір для кращої видимості */
  border-radius: 10px;
}
</style>