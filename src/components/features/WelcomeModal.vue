<script setup lang="ts">
import { ref } from 'vue'
import BaseModal from '../ui/BaseModal.vue'
import BaseButton from "../ui/BaseButton.vue"; // <-- ІМПОРТУЄМО БАЗОВЕ ВІКНО (перевір шлях)

defineProps<{ isOpen: boolean }>()
const emit = defineEmits(['close'])

const dontShowAgain = ref(false)

const handleClose = () => {
  emit('close', dontShowAgain.value)
}
</script>

<template>
  <BaseModal :is-open="isOpen" @close="handleClose">

    <div class="p-5 bg-linear-to-r from-indigo-600 to-indigo-700 text-white relative">
      <div class="absolute top-4 right-4 bg-amber-400 text-slate-900 text-[10px] font-black uppercase px-2 py-0.5 rounded-md tracking-wider shadow-sm">
        Alpha
      </div>
      <h2 class="text-xl font-black flex items-center gap-2">
        <span class="material-symbols-outlined text-[28px]">map</span>
        e-Toilet PWA
      </h2>
      <p class="text-xs text-indigo-100 mt-1 font-medium">
        Інтерактивна мапа міських вбиралень Дніпра
      </p>
    </div>

    <div class="p-6 overflow-y-auto space-y-4 text-slate-600">
      <p class="text-sm leading-relaxed">
        Вітаємо! Це некомерційний краудсорсинговий проєкт, де кожен мешканець може допомогти актуалізувати базу безкоштовних, платних та біотуалетів міста.
      </p>

      <div class="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
        <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1">
          <span class="material-symbols-outlined text-[16px]">info</span>
          Швидка інструкція
        </h3>

        <div class="flex gap-3 items-start">
          <div class="flex items-center justify-center bg-blue-600 text-white rounded-full p-1.5 shadow-sm shrink-0">
            <span class="material-symbols-outlined text-[16px]">wc</span>
          </div>
          <p class="text-xs font-medium leading-tight">
            <span class="font-bold text-slate-800">Сині та зелені маркери</span> — клікайте на них на мапі, щоб побачити ціну, години роботи, стан замка, наявність рукомийника чи фото.
          </p>
        </div>

        <div class="flex gap-3 items-start">
          <div class="flex items-center justify-center bg-white border border-slate-200 text-slate-700 rounded-full p-1.5 shadow-sm shrink-0">
            <span class="material-symbols-outlined text-[16px]">my_location</span>
          </div>
          <p class="text-xs font-medium leading-tight">
            <span class="font-bold text-slate-800">Кнопка "Де я"</span> — визначає ваше поточне GPS-розташування на мапі для швидкої навігації.
          </p>
        </div>

        <div class="flex gap-3 items-start">
          <div class="flex items-center justify-center bg-indigo-600 text-white rounded-full p-1.5 shadow-sm shrink-0">
            <span class="material-symbols-outlined text-[16px]">add</span>
          </div>
          <p class="text-xs font-medium leading-tight">
            <span class="font-bold text-slate-800">Кнопка "Додати"</span> — активує режим прицілу. Перетягніть карту під маркер, щоб надіслати нову точку на модерацію.
          </p>
        </div>

        <div class="flex gap-3 items-start">
          <div class="flex items-center justify-center bg-white border border-slate-200 text-slate-500 rounded-full p-1.5 shadow-sm shrink-0">
            <span class="material-symbols-outlined text-[16px]">search</span>
          </div>
          <p class="text-xs font-medium leading-tight">
            <span class="font-bold text-slate-800">Пошук адреси</span> — дозволяє миттєво переміститися у потрібну точку міста за назвою вулиці.
          </p>
        </div>
      </div>
    </div>

    <div class="p-4 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-4">

      <label class="flex items-center gap-2 cursor-pointer select-none self-start sm:self-center">
        <input type="checkbox" v-model="dontShowAgain" class="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 accent-indigo-600">
        <span class="text-xs font-semibold text-slate-500 hover:text-slate-700">Більше не показувати</span>
      </label>

      <BaseButton @click="handleClose" class="sm:w-auto shadow-md">
        Зрозуміло
      </BaseButton>

    </div>

  </BaseModal>
</template>