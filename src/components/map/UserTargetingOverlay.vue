<script setup lang="ts">
defineProps<{ isActive: boolean }>()
const emit = defineEmits(['confirm'])
</script>

<template>
  <div v-if="isActive" class="absolute inset-0 z-[1000] pointer-events-none flex flex-col items-center justify-center">
    <span class="material-symbols-outlined text-[40px] text-indigo-600 drop-shadow-lg -mt-10">location_on</span>
    <button
        @click="emit('confirm')"
        class="mt-4 pointer-events-auto bg-slate-900 text-white px-6 py-3 rounded-full font-medium shadow-xl hover:bg-slate-800 active:scale-95 transition-all"
    >
      Підтвердити моє розташування
    </button>
  </div>
</template>