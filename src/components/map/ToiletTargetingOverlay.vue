<script setup lang="ts">
import BaseButton from '../ui/BaseButton.vue'

defineProps<{ isActive: boolean }>()
const emit = defineEmits(['snap-gps', 'search', 'confirm', 'cancel'])
</script>

<template>
  <div v-if="isActive" class="absolute inset-0 z-1000 pointer-events-none flex flex-col items-center justify-between p-6">
    <div class="bg-slate-900/90 text-white text-xs font-medium px-4 py-2.5 rounded-full shadow-md mt-4 animate-fade-in text-center max-w-xs">
      📍 Перетягніть карту під приціл або використайте швидкі кнопки
    </div>

    <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
      <span class="material-symbols-outlined text-[40px] text-emerald-600 drop-shadow-lg -mt-10">location_on</span>
    </div>

    <div class="w-full max-w-sm flex flex-col gap-4 items-center">

      <div class="flex gap-3 pointer-events-auto">
        <button @click="emit('snap-gps')" class="flex items-center gap-2 bg-white text-slate-800 text-xs font-semibold px-4 py-2.5 rounded-full shadow-lg hover:bg-slate-50 transition-all">
          <span class="material-symbols-outlined text-[16px] text-emerald-600">my_location</span>
          Я стою біля туалету
        </button>

        <button @click="emit('search')" class="flex items-center gap-2 bg-white text-slate-800 text-xs font-semibold px-4 py-2.5 rounded-full shadow-lg hover:bg-slate-50 transition-all">
          <span class="material-symbols-outlined text-[16px] text-slate-500">search</span>
          Пошук адреси
        </button>
      </div>

      <div class="flex gap-2 w-full pointer-events-auto bg-white/80 backdrop-blur-md p-3 rounded-2xl shadow-xl border border-slate-100">
        <BaseButton variant="success" @click="emit('confirm')" class="shadow-md flex-1">
          Встановити туалет тут
        </BaseButton>
        <BaseButton variant="secondary" @click="emit('cancel')" class="w-fit! flex-none px-5">
          Скасувати
        </BaseButton>
      </div>

    </div>
  </div>
</template>