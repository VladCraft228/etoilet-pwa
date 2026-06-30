<script setup lang="ts">
defineProps<{
  // Оновили типізацію, щоб ловити type
  info: { distance: number; mins: number; type: 'osrm' | 'direct' } | null
}>()

const emit = defineEmits(['close'])
</script>

<template>
  <div v-if="info" class="absolute top-4 left-4 right-4 z-1000 flex justify-center animate-fade-in pointer-events-none">
    <div class="bg-white/95 backdrop-blur-md shadow-xl rounded-2xl p-3 flex items-center justify-between gap-4 w-full max-w-sm pointer-events-auto border border-slate-100">

      <div class="flex items-center gap-3">
        <div :class="['p-2 rounded-xl text-white shadow-sm', info.type === 'direct' ? 'bg-amber-500' : 'bg-indigo-600']">
          <span class="material-symbols-outlined text-[24px]">
            {{ info.type === 'direct' ? 'explore' : 'directions_walk' }}
          </span>
        </div>

        <div class="flex flex-col">
          <span class="text-sm font-black text-slate-800">
            {{ info.mins }} хв {{ info.type === 'direct' ? 'навпростець' : 'пішки' }}
          </span>
          <span class="text-xs font-medium text-slate-500">
            {{ info.distance }} метрів
          </span>
        </div>
      </div>

      <button @click="emit('close')" class="bg-slate-100 hover:bg-slate-200 text-slate-600 p-2 rounded-full transition-colors active:scale-95">
        <span class="material-symbols-outlined text-[20px]">close</span>
      </button>

    </div>
  </div>
</template>