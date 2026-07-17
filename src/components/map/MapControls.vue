<script setup lang="ts">
defineProps<{
  isLocating: boolean
}>()

const emit = defineEmits(['locate', 'add', 'zoom-in', 'zoom-out', 'compass'])
</script>

<template>
  <!-- Головний контейнер тепер адаптований під виріз знизу на iPhone -->
  <div class="absolute inset-0 z-50 flex flex-col justify-end p-6 pointer-events-none pb-[calc(16px+env(safe-area-inset-bottom))]">

    <!-- БЛОК ПРАВОРУЧ: Зум (+ / -) -->
    <div class="absolute right-6 bottom-32 flex flex-col pointer-events-auto shadow-xl rounded-2xl overflow-hidden border border-white/20">
      <!-- Зум ПЛЮС -->
      <button
          @click="emit('zoom-in')"
          class="flex items-center justify-center w-12 h-12 bg-white/90 backdrop-blur-md text-slate-700 hover:bg-slate-50 active:bg-slate-200 transition-colors border-b border-slate-100 cursor-pointer"
      >
        <span class="material-symbols-outlined text-[24px]">add</span>
      </button>

      <!-- Зум МІНУС -->
      <button
          @click="emit('zoom-out')"
          class="flex items-center justify-center w-12 h-12 bg-white/90 backdrop-blur-md text-slate-700 hover:bg-slate-50 active:bg-slate-200 transition-colors cursor-pointer"
      >
        <span class="material-symbols-outlined text-[24px]">remove</span>
      </button>
    </div>

    <!-- БЛОК ПО ЦЕНТРУ: Острівне меню -->
    <div class="relative mx-auto flex items-center gap-6 px-6 h-16 bg-white/80 backdrop-blur-xl rounded-full shadow-2xl border border-white/40 pointer-events-auto">

      <!-- Кнопка Компаса -->
      <button
          @click="emit('compass')"
          class="flex items-center justify-center w-10 h-10 text-slate-600 rounded-full hover:bg-slate-200/50 active:scale-95 transition-all cursor-pointer"
          title="Повернути на північ"
      >
        <span class="material-symbols-outlined text-[26px]">explore</span>
      </button>

      <!-- ГОЛОВНА КНОПКА ДОДАВАННЯ (Стабільне винесення вгору через абсолют) -->
      <div class="w-16 h-16 relative flex justify-center">
        <button
            @click="emit('add')"
            class="absolute bottom-2 flex items-center justify-center w-16 h-16 bg-indigo-600 text-white rounded-full shadow-lg shadow-indigo-600/30 hover:bg-indigo-700 active:scale-95 transition-all border-4 border-white cursor-pointer"
        >
          <span class="material-symbols-outlined text-[30px]">add_location_alt</span>
        </button>
      </div>

      <!-- Кнопка Геолокації -->
      <button
          @click="emit('locate')"
          :disabled="isLocating"
          class="flex items-center justify-center w-10 h-10 text-indigo-600 rounded-full hover:bg-indigo-50 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
      >
        <span v-if="!isLocating" class="material-symbols-outlined text-[26px]">my_location</span>
        <div v-else class="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </button>

    </div>

  </div>
</template>