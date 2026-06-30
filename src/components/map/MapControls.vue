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
        class="flex items-center justify-center w-14 h-14 bg-white text-slate-700 rounded-full shadow-xl hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
    >
      <span v-if="!isLocating" class="material-symbols-outlined text-[28px]">my_location</span>

      <div v-else class="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
    </button>

    <button
        @click="emit('add')"
        class="flex items-center justify-center w-14 h-14 bg-indigo-600 text-white rounded-full shadow-xl shadow-indigo-600/30 hover:bg-indigo-700 active:scale-95 transition-all cursor-pointer"
    >
      <span class="material-symbols-outlined text-[32px]">add</span>
    </button>
  </div>
</template>