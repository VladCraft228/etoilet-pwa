<script setup lang="ts">
import { getThumbnailUrl } from "../utils/imageUtils.ts";

// Тіпізуємо структуру для безпеки коду та автокомпліту
interface ToiletImage {
  image_url: string;
}

interface Toilet {
  id: number;
  type: 'public' | 'bio';
  price: number;
  work_hours?: string;
  stalls_count?: number;
  urinals_count?: number;
  user_comment?: string;
  has_wheelchair_accessible?: boolean;
  has_washbasin?: boolean;
  is_lock_broken?: boolean;
  toilet_images?: ToiletImage[];
}

defineProps<{
  toilet: Toilet
}>()

const emit = defineEmits<{
  (e: 'build-route', toilet: Toilet): void
}>()
</script>

<template>
  <!-- overflow-hidden на батьку, щоб картинка ідеально скруглялася по кутах попапу -->
  <div class="flex flex-col min-w-50 font-sans bg-white overflow-hidden rounded-xl">

    <!-- Блок фото -->
    <div v-if="toilet.toilet_images && toilet.toilet_images.length > 0" class="w-full h-40 overflow-hidden bg-slate-100">
      <img
          :src="getThumbnailUrl(toilet.toilet_images[0].image_url)"
          loading="lazy"
          decoding="async"
          class="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
          alt="Фото вбиральні"
      />
    </div>

    <!-- Контентна частина: збільшено падінг для кращого сприйняття -->
    <div class="p-3 flex flex-col gap-2">
      <div>
        <h3 class="font-bold text-slate-900 text-base leading-tight">
          {{ toilet.type === 'public' ? 'Громадська вбиральня' : 'Біотуалет' }}
        </h3>

        <!-- Ціна тепер доступна для всіх типів, якщо вона вказана -->
        <p v-if="toilet.price === 0" class="text-emerald-600 font-bold text-xs mt-0.5">Безкоштовно</p>
        <p v-else class="font-semibold text-slate-700 text-xs mt-0.5">Ціна: {{ toilet.price }} грн</p>
      </div>

      <!-- Додаткова інформація для public -->
      <div v-if="toilet.type === 'public' || toilet.work_hours || toilet.stalls_count" class="text-xs text-slate-600">
        <div class="flex flex-wrap items-center justify-between gap-2 w-full">
          <p v-if="toilet.work_hours" class="flex items-center gap-1 text-slate-500 font-medium">
            <span class="material-symbols-outlined text-[14px]">schedule</span>
            {{ toilet.work_hours }}
          </p>

          <div class="flex items-center gap-2 text-slate-500 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100" :class="{ 'ml-auto': !toilet.work_hours }">
            <span class="flex items-center gap-0.5" title="Кабінки">
              <span class="material-symbols-outlined text-[14px]">door_front</span>
              <b class="text-slate-700">{{ toilet.stalls_count || 1 }}</b>
            </span>
            <span v-if="toilet.urinals_count && toilet.urinals_count > 0" class="flex items-center gap-0.5" title="Пісуари">
              <span class="material-symbols-outlined text-[14px]">man</span>
              <b class="text-slate-700">{{ toilet.urinals_count }}</b>
            </span>
          </div>
        </div>
      </div>

      <!-- Коментар для біотуалетів -->
      <p v-if="toilet.type === 'bio' && toilet.user_comment" class="text-xs text-slate-500 italic bg-slate-50 p-2 rounded-lg border border-dashed border-slate-200">
        «{{ toilet.user_comment }}»
      </p>

      <!-- Теги зручностей -->
      <div class="flex flex-wrap gap-1 mt-0.5">
        <span v-if="toilet.has_wheelchair_accessible" class="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-md border border-emerald-100">
          <span class="material-symbols-outlined text-[12px]">accessible</span>
          Доступно для візків
        </span>
        <span v-else class="inline-flex items-center gap-1 bg-slate-50 text-slate-400 text-[10px] font-medium px-2 py-0.5 rounded-md border border-slate-100">
          <span class="material-symbols-outlined text-[12px]">not_accessible</span>
          Не облаштовано
        </span>

        <span v-if="toilet.has_washbasin" class="inline-flex items-center gap-1 bg-blue-50 text-blue-600 text-[10px] font-bold px-2 py-0.5 rounded-md border border-blue-100">
          <span class="material-symbols-outlined text-[12px]">soap</span>
          Рукомийник
        </span>

        <!-- Специфічні теги для біотуалетів -->
        <template v-if="toilet.type === 'bio'">
          <span v-if="!toilet.is_lock_broken" class="inline-flex items-center gap-1 bg-indigo-50 text-indigo-600 text-[10px] font-bold px-2 py-0.5 rounded-md border border-indigo-100">
            <span class="material-symbols-outlined text-[12px]">lock</span>
            Є замок
          </span>
          <span v-else class="inline-flex items-center gap-1 bg-red-50 text-red-600 text-[10px] font-bold px-2 py-0.5 rounded-md border border-red-100">
            <span class="material-symbols-outlined text-[12px]">lock_open</span>
            Замок зламано
          </span>
        </template>
      </div>

      <!-- Кнопка (Прибрано дублюючий обгортковий div) -->
      <button
          @click="emit('build-route', toilet)"
          class="mt-1 w-full flex items-center justify-center gap-1.5 bg-indigo-600 text-white text-xs font-bold py-2 rounded-lg hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-sm cursor-pointer"
      >
        <span class="material-symbols-outlined text-[16px]">directions_walk</span>
        Маршрут сюди
      </button>
    </div>

  </div>
</template>