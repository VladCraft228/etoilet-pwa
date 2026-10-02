<script setup lang="ts">
defineProps<{
  isLocating: boolean
}>()

const emit = defineEmits<{
  (e: 'locate'): void
  (e: 'find-nearest'): void
  (e: 'add'): void
  (e: 'zoom-in'): void
  (e: 'zoom-out'): void
  (e: 'compass'): void
}>()
</script>

<template>
  <!-- Головний контейнер тепер адаптований під виріз знизу на iPhone -->
  <div class="absolute inset-0 z-50 flex flex-col justify-end p-6 pointer-events-none pb-[calc(16px+env(safe-area-inset-bottom))]">

    <!-- БЛОК ПРАВОРУЧ: Компас + Зум (+ / -) -->
    <div class="absolute right-6 bottom-32 flex flex-col items-center gap-2.5 pointer-events-auto">
      <!-- Кнопка Компаса над зумом -->
      <button
          type="button"
          @click="emit('compass')"
          class="flex items-center justify-center w-12 h-12 bg-white/90 backdrop-blur-md text-slate-700 hover:bg-slate-50 active:scale-95 transition-all shadow-xl rounded-2xl border border-white/20 cursor-pointer"
          title="Повернути на північ"
      >
        <span class="material-symbols-outlined text-[26px]">explore</span>
      </button>

      <!-- Блок кнопок Зум -->
      <div class="flex flex-col shadow-xl rounded-2xl overflow-hidden border border-white/20">
        <button
            type="button"
            @click="emit('zoom-in')"
            class="flex items-center justify-center w-12 h-12 bg-white/90 backdrop-blur-md text-slate-700 hover:bg-slate-50 active:bg-slate-200 transition-colors border-b border-slate-100 cursor-pointer"
            title="Наблизити"
        >
          <span class="material-symbols-outlined text-[24px]">add</span>
        </button>

        <button
            type="button"
            @click="emit('zoom-out')"
            class="flex items-center justify-center w-12 h-12 bg-white/90 backdrop-blur-md text-slate-700 hover:bg-slate-50 active:bg-slate-200 transition-colors cursor-pointer"
            title="Віддалити"
        >
          <span class="material-symbols-outlined text-[24px]">remove</span>
        </button>
      </div>
    </div>

    <!-- БЛОК ПО ЦЕНТРУ: Острівне меню -->
    <div class="relative mx-auto flex items-center gap-4 px-5 h-16 bg-white/80 backdrop-blur-xl rounded-full shadow-2xl border border-white/40 pointer-events-auto">

      <button
          type="button"
          @click="emit('add')"
          class="flex items-center justify-center w-10 h-10 text-slate-700 rounded-full hover:bg-slate-200/50 active:scale-95 transition-all cursor-pointer"
          title="Запропонувати вбиральню"
      >
        <span class="material-symbols-outlined text-[24px]">add_location_alt</span>
      </button>

      <!-- ГОЛОВНА КНОПКА ПОШУКУ НАЙБЛИЖЧОЇ -->
      <div class="w-16 h-16 relative flex justify-center">
        <button
            type="button"
            @click="emit('find-nearest')"
            class="absolute bottom-2 flex items-center justify-center w-16 h-16 bg-indigo-600 text-white rounded-full shadow-lg shadow-indigo-600/40 hover:bg-indigo-700 active:scale-95 transition-all border-4 border-white cursor-pointer"
            title="Знайти найближчу вбиральню"
        >
          <span class="material-symbols-outlined text-[32px]">near_me</span>
        </button>
      </div>

      <!-- Кнопка Геолокації -->
      <button
          type="button"
          @click="emit('locate')"
          :disabled="isLocating"
          class="flex items-center justify-center w-10 h-10 text-indigo-600 rounded-full hover:bg-indigo-50 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
          title="Моя геолокація"
      >
        <span v-if="!isLocating" class="material-symbols-outlined text-[26px]">my_location</span>
        <div v-else class="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </button>

    </div>

  </div>
</template>