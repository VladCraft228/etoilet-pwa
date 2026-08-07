<script setup lang="ts">
import { computed } from "vue";
import { getThumbnailUrl } from "../utils/imageUtils.ts";
import type { Toilet } from "../../types.ts";

const props = defineProps<{
  toilet: Toilet;
  isAdmin?: boolean;
}>();

const emit = defineEmits<{
  (e: 'build-route', toilet: Toilet): void;
  (e: 'edit', toilet: Toilet): void;
  (e: 'move', toilet: Toilet): void;
  (e: 'delete', toiletId: string): void;
}>();

const title = computed(() =>
    props.toilet.type === 'public' ? 'Громадська вбиральня' : 'Біотуалет'
);
</script>

<template>
  <div class="flex flex-col w-65 sm:w-70 font-sans bg-white overflow-hidden rounded-xl">

    <!-- Блок фото -->
    <div v-if="toilet.toilet_images?.length" class="w-full h-40 overflow-hidden bg-slate-100">
      <img
          :src="getThumbnailUrl(toilet.toilet_images[0].image_url)"
          loading="lazy"
          decoding="async"
          class="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
          alt="Фото вбиральні"
      />
    </div>

    <!-- Контентна частина зі скролом -->
    <div class="p-3 flex flex-col gap-2.5">
      <h3 class="font-bold text-slate-900 text-base leading-tight mb-0.5">
        {{ title }}
      </h3>

      <!-- Головна інфо-стрічка: ціна та години роботи -->
      <div v-if="toilet.price !== undefined || toilet.work_hours" class="flex gap-1.5 text-xs w-full shrink-0">

        <!-- Ціна -->
        <div class="flex-1 w-1/2 min-w-0 flex items-center gap-1 p-1.5 bg-emerald-50/80 border border-emerald-100 rounded-lg">
          <span class="material-symbols-outlined text-[18px] text-emerald-600 shrink-0">payments</span>
          <div class="flex flex-col min-w-0">
            <span class="text-[9px] text-emerald-700/80 font-medium leading-tight">Вартість</span>
            <span class="font-bold text-emerald-950 text-[10px] sm:text-xs leading-tight wrap-break-word">
              {{ toilet.price === 0 ? 'Безкоштовно' : `${toilet.price} грн` }}
            </span>
          </div>
        </div>

        <!-- Час роботи -->
        <div v-if="toilet.work_hours" class="flex-1 w-1/2 min-w-0 flex items-center gap-1 p-1.5 bg-slate-50 border border-slate-100 rounded-lg">
          <span class="material-symbols-outlined text-[18px] text-slate-500 shrink-0">schedule</span>
          <div class="flex flex-col min-w-0">
            <span class="text-[9px] text-slate-400 font-medium leading-tight">Час роботи</span>
            <span class="font-bold text-slate-800 text-[10px] sm:text-xs leading-tight wrap-break-word">
              {{ toilet.work_hours }}
            </span>
          </div>
        </div>

      </div>

      <!-- Кабінки/пісуари -->
      <div
          v-if="toilet.stalls_count || toilet.urinals_count"
          class="flex items-center gap-2 p-1.5 bg-slate-50 border border-slate-100 rounded-lg text-slate-600 text-xs shrink-0"
      >
        <span class="flex items-center gap-1 shrink-0" title="Кабінки">
          <span class="material-symbols-outlined text-[16px] text-slate-500">door_front</span>
          <b class="text-slate-800 font-semibold">{{ toilet.stalls_count || 1 }}</b>
          <span class="text-slate-400 font-medium">кабін.</span>
        </span>

        <span
            v-if="toilet.urinals_count && toilet.urinals_count > 0"
            class="flex items-center gap-1 border-l border-slate-200 pl-2 shrink-0"
            title="Пісуари"
        >
          <span class="material-symbols-outlined text-[16px] text-slate-500">man</span>
          <b class="text-slate-800 font-semibold">{{ toilet.urinals_count }}</b>
          <span class="text-slate-400 font-medium">пісуар.</span>
        </span>
      </div>

      <!-- Зручності -->
      <div
          v-if="toilet.has_wheelchair_accessible !== undefined || toilet.has_washbasin || toilet.type === 'bio'"
          class="flex flex-wrap gap-1.5 w-full shrink-0"
      >
        <!-- Візок -->
        <span
            v-if="toilet.has_wheelchair_accessible"
            title="Доступно для візків"
            class="flex-1 min-w-[45%] flex items-center justify-center gap-1 h-8 rounded-md bg-emerald-50 border border-emerald-100 text-emerald-700 text-[10px] font-semibold"
        >
          <span class="material-symbols-outlined text-[14px]">accessible</span>
          Візок
        </span>
        <span
            v-else
            title="Не облаштовано для візків"
            class="flex-1 min-w-[45%] flex items-center justify-center gap-1 h-8 rounded-md bg-slate-50 border border-slate-100 text-slate-400 text-[10px] font-medium"
        >
          <span class="material-symbols-outlined text-[14px]">not_accessible</span>
          Без візка
        </span>

        <!-- Рукомийник -->
        <span
            v-if="toilet.has_washbasin"
            title="Є рукомийник"
            class="flex-1 min-w-[45%] flex items-center justify-center gap-1 h-8 rounded-md bg-blue-50 border border-blue-100 text-blue-600 text-[10px] font-semibold"
        >
          <span class="material-symbols-outlined text-[14px]">soap</span>
          Умивальник
        </span>

        <!-- Замок (для біотуалетів) -->
        <template v-if="toilet.type === 'bio'">
          <span
              v-if="!toilet.is_lock_broken"
              title="Замок працює"
              class="flex-1 min-w-[45%] flex items-center justify-center gap-1 h-8 rounded-md bg-indigo-50 border border-indigo-100 text-indigo-600 text-[10px] font-semibold"
          >
            <span class="material-symbols-outlined text-[14px]">lock</span>
            Є замок
          </span>
          <span
              v-else
              title="Замок зламано"
              class="flex-1 min-w-[45%] flex items-center justify-center gap-1 h-8 rounded-md bg-red-50 border border-red-100 text-red-600 text-[10px] font-semibold"
          >
            <span class="material-symbols-outlined text-[14px]">lock_open</span>
            Зламано
          </span>
        </template>
      </div>

      <!-- Коментар -->
      <div
          v-if="toilet.user_comment"
          class="bg-amber-50/40 p-3 rounded-xl border border-dashed border-amber-200 mt-1"
      >
        <div class="max-h-11 overflow-y-auto custom-scrollbar">
          <p class="text-[13px] text-slate-700 italic relative font-medium leading-relaxed">
            <span class="absolute -top-1 -left-1 text-amber-300 text-lg">"</span>
            <span class="pl-2.5 block">
        {{ toilet.user_comment }}
      </span>
          </p>
        </div>
      </div>

      <!-- Кнопка маршруту -->
      <button
          @click="emit('build-route', toilet)"
          class="w-full flex items-center justify-center gap-1.5 bg-indigo-600 text-white text-xs font-bold py-2 rounded-lg hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-sm cursor-pointer shrink-0"
      >
        <span class="material-symbols-outlined text-[16px]">directions_walk</span>
        Маршрут сюди
      </button>

      <!-- Адмін-панель -->
      <div v-if="isAdmin" class="pt-2 border-t border-slate-200/60 shrink-0">
        <span class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
          Керування
        </span>
        <div class="flex gap-1.5">
          <button
              @click="emit('edit', toilet)"
              class="flex-1 flex items-center justify-center py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl transition-colors cursor-pointer"
              title="Редагувати"
          >
            <span class="material-symbols-outlined text-[16px]">edit</span>
          </button>
          <button
              @click="emit('move', toilet)"
              class="flex-1 flex items-center justify-center py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-xl transition-colors cursor-pointer"
              title="Перемістити"
          >
            <span class="material-symbols-outlined text-[16px]">distance</span>
          </button>
          <button
              @click="emit('delete', toilet.id)"
              class="flex-[0.5] flex items-center justify-center py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition-colors cursor-pointer"
              title="Видалити"
          >
            <span class="material-symbols-outlined text-[16px]">delete</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
</style>