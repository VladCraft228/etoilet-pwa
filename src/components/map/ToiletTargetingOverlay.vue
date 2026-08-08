<script setup lang="ts">
import BaseButton from '../ui/BaseButton.vue'

defineProps<{
  isActive: boolean
}>()

const emit = defineEmits<{
  'snap-gps': []
  search: []
  confirm: []
  cancel: []
}>()
</script>

<template>
  <div
      v-if="isActive"
      class="absolute inset-0 z-[1000] pointer-events-none"
  >
    <!-- Верхня підказка -->
    <div
        class="absolute top-4 left-1/2 -translate-x-1/2
             w-max max-w-[calc(100%-32px)]"
    >
      <div
          class="bg-slate-900/90 backdrop-blur-sm
               text-white text-xs font-medium
               px-4 py-2.5 rounded-full
               shadow-lg text-center
               animate-fade-in"
      >
        Перемістіть мапу так, щоб приціл був над туалетом
      </div>
    </div>

    <!-- Центральний маркер -->
    <div
        class="absolute inset-0 flex items-center justify-center
             pointer-events-none"
    >
      <div class="relative flex items-center justify-center -mt-10">
        <div
            class="absolute bottom-0 w-5 h-2
                 bg-black/20 rounded-full blur-[2px]"
        />

        <span
            class="material-symbols-outlined
                 text-[42px] text-emerald-600
                 drop-shadow-[0_2px_4px_rgba(0,0,0,0.35)]
                 relative"
        >
          location_on
        </span>
      </div>
    </div>

    <!-- Нижня панель -->
    <div
        class="absolute bottom-5 left-1/2 -translate-x-1/2
             w-[calc(100%-32px)] max-w-sm
             pointer-events-auto"
    >
      <!-- Швидкі дії -->
      <div class="flex gap-2 mb-3">
        <button
            type="button"
            @click="emit('snap-gps')"
            class="flex-1 flex items-center justify-center gap-1.5
                 bg-white/95 backdrop-blur-md
                 text-slate-800 text-xs font-semibold
                 px-3 py-2.5 rounded-xl
                 shadow-lg border border-slate-200/80
                 hover:bg-white active:scale-[0.98]
                 transition-all"
        >
          <span
              class="material-symbols-outlined
                   text-[17px] text-emerald-600"
          >
            my_location
          </span>

          Я тут
        </button>

        <button
            type="button"
            @click="emit('search')"
            class="flex-1 flex items-center justify-center gap-1.5
                 bg-white/95 backdrop-blur-md
                 text-slate-800 text-xs font-semibold
                 px-3 py-2.5 rounded-xl
                 shadow-lg border border-slate-200/80
                 hover:bg-white active:scale-[0.98]
                 transition-all"
        >
          <span
              class="material-symbols-outlined
                   text-[17px] text-slate-500"
          >
            search
          </span>

          Пошук адреси
        </button>
      </div>

      <!-- Основні дії -->
      <div
          class="bg-white/90 backdrop-blur-md
               border border-slate-200/80
               rounded-2xl shadow-xl p-3"
      >
        <BaseButton
            variant="success"
            @click="emit('confirm')"
            class="w-full shadow-md"
        >
          <span
              class="material-symbols-outlined text-[18px]"
          >
            add_location_alt
          </span>

          Встановити туалет тут
        </BaseButton>

        <button
            type="button"
            @click="emit('cancel')"
            class="mt-2 w-full py-2 text-sm font-medium
                 text-slate-500 hover:text-slate-700
                 transition-colors"
        >
          Скасувати
        </button>
      </div>
    </div>
  </div>
</template>