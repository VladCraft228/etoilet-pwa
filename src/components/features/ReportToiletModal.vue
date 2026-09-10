<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useToast } from 'vue-toastification'
import BaseModal from '../ui/BaseModal.vue'
import BaseButton from '../ui/BaseButton.vue'
import { REPORT_REASONS_LABELS, type ReportReason, type Toilet } from '../../types'
import { reportService } from '../../services/reportService'

const props = defineProps<{
  isOpen: boolean
  toilet: Toilet | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submitted'): void
}>()

const toast = useToast()

const selectedReasons = ref<ReportReason[]>([])
const comment = ref('')
const isSubmitting = ref(false)

// Чи вибрано пункт "Інша проблема"
const isOtherSelected = computed(() => selectedReasons.value.includes('other'))

// Валідація: має бути обрано мінімум 1 пункт, а якщо серед них є "other" — обов'язковий коментар
const isFormValid = computed(() => {
  if (selectedReasons.value.length === 0) return false
  return !(isOtherSelected.value && !comment.value.trim());
})

// Логіка кліку по чекбоксу
const toggleReason = (key: ReportReason) => {
  if (key === 'does_not_exist') {
    // Якщо обирають "немає на місці" — робимо його єдиним обраним
    if (selectedReasons.value.includes('does_not_exist')) {
      selectedReasons.value = []
    } else {
      selectedReasons.value = ['does_not_exist']
      comment.value = ''
    }
    return
  }

  // Якщо обирають щось інше — прибираємо "does_not_exist", бо туалет все ж існує
  selectedReasons.value = selectedReasons.value.filter((r) => r !== 'does_not_exist')

  const index = selectedReasons.value.indexOf(key)
  if (index > -1) {
    selectedReasons.value.splice(index, 1)
    if (key === 'other') comment.value = ''
  } else {
    selectedReasons.value.push(key)
  }
}

// Скидання форми при кожному відкритті
watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    selectedReasons.value = []
    comment.value = ''
  }
})

const closeModal = () => {
  if (isSubmitting.value) return
  emit('close')
}

const handleSubmit = async () => {
  if (!props.toilet?.id) return

  if (selectedReasons.value.length === 0) {
    toast.warning('Оберіть хоча б одну проблему зі списку.')
    return
  }

  if (isOtherSelected.value && !comment.value.trim()) {
    toast.warning('Будь ласка, деталізуйте "Іншу проблему" в коментарі.')
    return
  }

  isSubmitting.value = true

  try {
    await reportService.submitToiletReport({
      toilet_id: props.toilet.id,
      reasons: selectedReasons.value,
      comment: isOtherSelected.value ? comment.value.trim() : undefined
    })

    toast.success('Дякуємо! Повідомлення надіслано адміністраторам.')
    emit('submitted')
    emit('close')
  } catch (error: any) {
    console.error('Помилка відправки скарги:', error)
    toast.error('Не вдалося надіслати повідомлення. Спробуйте пізніше.')
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <BaseModal :is-open="isOpen" @close="closeModal">
    <!-- 1. ШАПКА МОДАЛКИ -->
    <div class="p-5 border-b border-slate-100 flex items-start justify-between bg-slate-50/60 shrink-0">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shadow-xs shadow-rose-200 shrink-0">
          <span class="material-symbols-outlined text-[20px]">report_problem</span>
        </div>
        <div>
          <h2 class="text-base font-bold text-slate-800 leading-tight">Повідомити про проблему</h2>
          <p class="text-xs text-slate-500 mt-0.5 line-clamp-1">
            {{ toilet?.address || 'Обрана вбиральня' }}
          </p>
        </div>
      </div>

      <button
          type="button"
          @click="closeModal"
          class="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
      >
        <span class="material-symbols-outlined text-[20px]">close</span>
      </button>
    </div>

    <!-- 2. ОСНОВНА СКРОЛ-ЗОНА -->
    <div class="p-5 overflow-y-auto custom-scrollbar flex flex-col gap-4 bg-white">
      <div>
        <div class="flex items-center justify-between ml-1 mb-2">
          <span class="text-[10px] uppercase font-bold text-slate-400">Що саме не так з локацією?</span>
          <span class="text-[10px] text-slate-400 font-medium">Можна обрати декілька</span>
        </div>

        <!-- Перелік чекбоксів-карток -->
        <div class="flex flex-col gap-2">
          <div
              v-for="(info, key) in REPORT_REASONS_LABELS"
              :key="key"
              @click="toggleReason(key)"
              class="flex items-center gap-3 p-3 rounded-xl border-2 transition-all cursor-pointer select-none"
              :class="selectedReasons.includes(key)
              ? 'border-indigo-600 bg-indigo-50/40 text-indigo-950 font-medium shadow-xs'
              : 'border-slate-100 hover:border-slate-200 bg-slate-50/50 text-slate-700'"
          >
            <span
                class="material-symbols-outlined text-[20px] shrink-0 transition-colors"
                :class="selectedReasons.includes(key) ? 'text-indigo-600' : 'text-slate-400'"
            >
              {{ info.icon }}
            </span>
            <span class="text-sm leading-snug flex-1">{{ info.title }}</span>

            <!-- Індикатор чекбоксу -->
            <div
                class="w-5 h-5 border flex items-center justify-center shrink-0 transition-all"
                :class="selectedReasons.includes(key)
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-slate-300 bg-white'"
            >
              <span v-if="selectedReasons.includes(key)" class="material-symbols-outlined text-[15px] font-bold">
                check
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Поле опису: показується тільки якщо вибрано "Інша проблема" -->
      <div v-if="isOtherSelected" class="flex flex-col gap-1 transition-all">
        <div class="flex items-center justify-between ml-1">
          <span class="text-[10px] uppercase font-bold text-slate-400">
            Опишіть проблему <span class="text-rose-500">*</span>
          </span>
          <span class="text-[10px] text-slate-400 font-medium">Обов'язкове поле</span>
        </div>

        <textarea
            v-model="comment"
            rows="3"
            autofocus
            placeholder="Опишіть детально, що саме не так з локацією..."
            class="p-3 bg-slate-50 rounded-xl text-sm text-slate-700 placeholder:text-slate-400 focus:outline-indigo-600 resize-none transition-colors border-2"
            :class="comment.trim() ? 'border-transparent focus:border-indigo-600' : 'border-amber-200 focus:border-indigo-600'"
        ></textarea>
      </div>
    </div>

    <!-- 3. ФУТЕР З КНОПКАМИ -->
    <div class="p-4 border-t border-slate-100 bg-slate-50 flex gap-3 justify-end shrink-0">
      <BaseButton
          variant="outline"
          class="py-2.5! px-5!"
          @click="closeModal"
          :disabled="isSubmitting"
      >
        Скасувати
      </BaseButton>

      <BaseButton
          variant="primary"
          class="py-2.5! px-6! shadow-md shadow-indigo-200"
          @click="handleSubmit"
          :disabled="isSubmitting || !isFormValid"
      >
        <span
            v-if="isSubmitting"
            class="material-symbols-outlined text-[20px] animate-spin mr-1"
        >
          sync
        </span>
        {{ isSubmitting ? 'Надсилання...' : 'Надіслати' }}
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