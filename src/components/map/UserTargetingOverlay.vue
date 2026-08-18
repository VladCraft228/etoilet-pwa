<script setup lang="ts">
import BaseButton from '../ui/BaseButton.vue'

defineProps<{
  isActive: boolean
}>()

const emit = defineEmits<{
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
    <div class="absolute top-4 left-1/2 -translate-x-1/2 w-max max-w-[calc(100%-32px)]">
      <div
          class="bg-slate-900/90 backdrop-blur-sm text-white text-xs font-medium
               px-4 py-2.5 rounded-full shadow-lg text-center
               animate-fade-in"
      >
        Перемістіть мапу так, щоб приціл був над вашим місцем
      </div>
    </div>

    <!-- Центральний приціл -->
    <div class="absolute inset-0 pointer-events-none">
  <span
      class="material-symbols-outlined
           absolute left-1/2 top-1/2
           -translate-x-1/2 -translate-y-1/2
           text-[42px]
           leading-none
           text-indigo-600
           drop-shadow-lg"
  >
    my_location
  </span>
    </div>

    <!-- Нижня панель -->
    <div
        class="absolute bottom-5 left-1/2 -translate-x-1/2
             w-[calc(100%-32px)] max-w-sm
             pointer-events-auto"
    >
      <div
          class="bg-white/90 backdrop-blur-md
               border border-slate-200/80
               rounded-2xl shadow-xl p-3"
      >
        <BaseButton
            variant="primary"
            @click="emit('confirm')"
            class="w-full shadow-md"
        >
          <span
              class="material-symbols-outlined text-[18px]"
          >
            check
          </span>

          Підтвердити це місцезнаходження
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