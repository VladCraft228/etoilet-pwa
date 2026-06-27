<script setup lang="ts">
defineProps<{
  isLocating: boolean
}>()

const emit = defineEmits(['locate', 'add'])
</script>

<template>
  <div class="absolute z-1000 bottom-8 right-8 flex flex-col gap-4">
    <button
        @click="emit('locate')"
        :disabled="isLocating"
        class="flex items-center justify-center w-14 h-14 bg-white text-slate-700 rounded-full shadow-xl hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-50"
    >
      <svg v-if="!isLocating" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-7 h-7">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
      </svg>
      <div v-else class="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
    </button>

    <button
        @click="emit('add')"
        class="flex items-center justify-center w-14 h-14 bg-indigo-600 text-white rounded-full shadow-xl shadow-indigo-600/30 hover:bg-indigo-700 active:scale-95 transition-all"
    >
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-8 h-8">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
    </button>
  </div>
</template>