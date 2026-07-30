<script setup lang="ts">
import BaseButton from '../ui/BaseButton.vue'

defineProps<{ isActive: boolean }>()
const emit = defineEmits(['confirm', 'cancel'])
</script>

<template>
  <div v-if="isActive" class="absolute inset-0 z-1000 pointer-events-none flex flex-col items-center justify-between p-6">

    <!-- Підказка зверху -->
    <div class="bg-slate-900/90 text-white text-xs font-medium px-4 py-2.5 rounded-full shadow-md mt-4 animate-fade-in text-center max-w-xs">
      📍 Наведіть приціл у нове місце для вбиральні
    </div>

    <!-- Маркер-приціл по центру екрана -->
    <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
      <span class="material-symbols-outlined text-[40px] text-indigo-600 drop-shadow-lg -mt-10 animate-bounce">
        location_on
      </span>
    </div>

    <!-- Панель дій внизу -->
    <div class="w-full max-w-sm flex flex-col gap-4 items-center">
      <div class="flex gap-2 w-full pointer-events-auto bg-white/80 backdrop-blur-md p-3 rounded-2xl shadow-xl border border-slate-100">
        <BaseButton variant="primary" @click="emit('confirm')" class="shadow-md flex-1">
          Зберегти нове місце
        </BaseButton>
        <BaseButton variant="secondary" @click="emit('cancel')" class="w-fit! flex-none px-5">
          Скасувати
        </BaseButton>
      </div>
    </div>

  </div>
</template>