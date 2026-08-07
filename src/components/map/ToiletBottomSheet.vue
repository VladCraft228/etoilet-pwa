<script setup lang="ts">
import {ref, computed} from "vue";
import {getThumbnailUrl} from "../utils/imageUtils.ts";
import type {Toilet} from "../../types.ts";

type SheetState = 'collapsed' | 'middle' | 'expanded';

const props = defineProps<{
  toilet: Toilet;
  isAdmin?: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'build-route', toilet: Toilet): void;
  (e: 'edit', toilet: Toilet): void;
  (e: 'move', toilet: Toilet): void;
  (e: 'delete', toiletId: string): void;
}>();

const title = computed(() =>
    props.toilet.type === 'public' ? 'Громадська вбиральня' : 'Біотуалет'
);

// ==========================================
// 👆 ЛОГІКА СВАЙПІВ (3 СТАНИ)
// ==========================================
const state = ref<SheetState>('middle');
const contentRef = ref<HTMLElement | null>(null);

let touchStartY = 0;
let touchStartTime = 0;

const stateClasses = computed(() => {
  switch (state.value) {
    case 'expanded':
      return 'translate-y-0';
    case 'middle':
      return 'translate-y-[calc(85vh-230px)]';
    case 'collapsed':
    default:
      return 'translate-y-[calc(85vh-200px)]';
  }
});

const handleTouchStart = (e: TouchEvent) => {
  touchStartY = e.touches[0].clientY;
  touchStartTime = Date.now();
};

const handleTouchEnd = (e: TouchEvent) => {
  const touchEndY = e.changedTouches[0].clientY;
  const deltaY = touchEndY - touchStartY;
  const timeDelta = Date.now() - touchStartTime;

  const isSwipeDown = deltaY > 40 && (timeDelta < 400 || deltaY > 100);
  const isSwipeUp = deltaY < -40 && (timeDelta < 400 || deltaY < -100);

  if (isSwipeUp) {
    if (state.value === 'collapsed') state.value = 'middle';
    else if (state.value === 'middle') state.value = 'expanded';
  } else if (isSwipeDown) {
    const isAtTop = contentRef.value ? contentRef.value.scrollTop <= 0 : true;

    if (isAtTop) {
      if (state.value === 'expanded') state.value = 'middle';
      else if (state.value === 'middle') state.value = 'collapsed';
      else emit('close');
    }
  }
};

const toggleExpand = () => {
  if (state.value === 'collapsed') state.value = 'middle';
  else if (state.value === 'middle') state.value = 'expanded';
  else state.value = 'collapsed';
};
</script>

<template>
  <div class="fixed inset-x-0 bottom-0 z-101 flex justify-center pointer-events-none px-2 pb-2 sm:px-0 sm:pb-0">
    <div
        :class="[
        'pointer-events-auto relative w-full max-w-md h-[85vh] bg-white rounded-3xl sm:rounded-b-none shadow-[0_-8px_30px_rgba(0,0,0,0.12)] flex flex-col overflow-hidden',
        'transition-transform duration-400 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform',
        stateClasses
      ]"
    >
      <!-- 🛠 Drag Handle -->
      <div
          class="relative pt-4 pb-3 flex justify-center items-center shrink-0 bg-white z-10 rounded-t-3xl cursor-grab active:cursor-grabbing touch-none touch-pan-y"
          @touchstart="handleTouchStart"
          @touchend="handleTouchEnd"
          @click="toggleExpand"
      >
        <div
            class="w-12 h-1.5 rounded-full transition-all duration-300"
            :class="state === 'expanded' ? 'bg-slate-300 scale-x-110' : 'bg-slate-200'"
        ></div>

        <button
            @click.stop="emit('close')"
            class="absolute right-4 top-3.5 w-8 h-8 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-full flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
        >
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      <!-- 📜 Скрол-контейнер -->
      <div
          ref="contentRef"
          class="overflow-y-auto custom-scrollbar flex flex-col pb-6 min-h-0 flex-1"
          @touchstart="handleTouchStart"
          @touchend="handleTouchEnd"
      >
        <!-- Заголовок та адреса -->
        <div class="px-5 pb-3 shrink-0">
          <h3 class="font-extrabold text-slate-900 text-[22px] tracking-tight leading-tight mb-1">
            {{ title }}
          </h3>
          <p v-if="toilet.address" class="text-sm text-slate-500 flex items-start gap-1 mt-1">
            <span class="material-symbols-outlined text-[16px] shrink-0 mt-0.5 text-slate-400">pin_drop</span>
            <span class="leading-tight">{{ toilet.address }}</span>
          </p>
        </div>

        <!-- Ціна + Години -->
        <div v-if="toilet.price !== undefined || toilet.work_hours" class="px-5 pb-3 shrink-0 grid grid-cols-1 min-[375px]:grid-cols-2 gap-2.5">
          <!-- Ціна -->
          <div class="flex items-center gap-2.5 bg-emerald-50/60 p-2.5 rounded-2xl border border-emerald-100/80">
            <div class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-[18px] text-emerald-600">payments</span>
            </div>
            <div class="flex flex-col min-w-0">
              <span class="text-[10px] uppercase tracking-wider font-extrabold text-emerald-700/80 leading-none mb-0.5">Вартість</span>
              <span class="text-[13px] font-bold text-slate-900 truncate leading-tight">
        <template v-if="Number(toilet.price) === 0">Безкоштовно</template>
        <template v-else>{{ toilet.price }} грн</template>
      </span>
            </div>
          </div>

          <!-- Графік -->
          <div v-if="toilet.work_hours"
               class="flex items-center gap-2.5 bg-slate-100/70 p-2.5 rounded-2xl border border-slate-200/50">
            <div class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-[18px] text-slate-600">schedule</span>
            </div>
            <div class="flex flex-col min-w-0">
              <span class="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 leading-none mb-0.5">Час роботи</span>
              <span class="text-[13px] font-bold text-slate-800 truncate leading-tight">{{ toilet.work_hours }}</span>
            </div>
          </div>
        </div>

        <!-- Маршрут -->
        <div class="px-5 pb-4 flex gap-2 shrink-0">
          <button
              @click="emit('build-route', toilet)"
              class="flex-1 flex items-center justify-center gap-2 bg-[#1A73E8] text-white py-3 rounded-2xl hover:bg-blue-600 active:scale-[0.98] transition-all shadow-md shadow-blue-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
          >
            <span class="material-symbols-outlined text-[20px]">directions_walk</span>
            <span class="text-[13px] font-bold">Маршрут</span>
          </button>
        </div>

        <!-- Фото -->
        <div v-if="toilet.toilet_images?.length" class="w-full h-44 shrink-0 mb-5 px-5">
          <img
              :src="getThumbnailUrl(toilet.toilet_images[0].image_url)"
              loading="lazy"
              decoding="async"
              class="w-full h-full object-cover  rounded-2xl shadow-sm border border-slate-100"
              alt="Фото вбиральні"
          />
        </div>

        <!-- Деталі / Теги зручностей -->
        <!-- 🏷️ Теги зручностей -->
        <div class="px-5 flex flex-wrap gap-2">
          <!-- Кабінки -->
          <span
              v-if="toilet.stalls_count"
              class="inline-flex max-[340px]:w-full items-center max-[340px]:justify-center gap-1.5 bg-slate-100 text-slate-700 text-[13px] font-bold px-3 py-1.5 rounded-xl border border-slate-200/60"
          >
            <span class="material-symbols-outlined text-[18px] text-slate-400">door_front</span>
            {{ toilet.stalls_count }} кабін.
          </span>

          <!-- Пісуари -->
          <span
              v-if="toilet.urinals_count"
              class="inline-flex max-[340px]:w-full items-center max-[340px]:justify-center gap-1.5 bg-slate-100 text-slate-700 text-[13px] font-bold px-3 py-1.5 rounded-xl border border-slate-200/60"
          >
            <span class="material-symbols-outlined text-[18px] text-slate-400">man</span>
            {{ toilet.urinals_count }} пісуар.
          </span>

          <!-- Доступність -->
          <span
              v-if="toilet.has_wheelchair_accessible"
              class="inline-flex max-[340px]:w-full items-center max-[340px]:justify-center gap-1 bg-emerald-50 text-emerald-700 text-[13px] font-bold px-3 py-1.5 rounded-xl border border-emerald-100"
          >
            <span class="material-symbols-outlined text-[16px]">accessible</span> Доступно для візків
          </span>
          <span
              v-else
              class="inline-flex max-[340px]:w-full items-center max-[340px]:justify-center gap-1 bg-slate-50 text-slate-500 text-[13px] font-medium px-3 py-1.5 rounded-xl border border-slate-200"
          >
            <span class="material-symbols-outlined text-[16px]">not_accessible</span> Не облаштовано
          </span>

          <!-- Рукомийник -->
          <span
              v-if="toilet.has_washbasin"
              class="inline-flex max-[340px]:w-full items-center max-[340px]:justify-center gap-1 bg-blue-50 text-blue-700 text-[13px] font-bold px-3 py-1.5 rounded-xl border border-blue-100"
          >
            <span class="material-symbols-outlined text-[16px]">soap</span> Рукомийник
          </span>

          <!-- Замок (для біотуалетів) -->
          <template v-if="toilet.type === 'bio'">
            <span
                v-if="!toilet.is_lock_broken"
                class="inline-flex max-[340px]:w-full items-center max-[340px]:justify-center gap-1 bg-indigo-50 text-indigo-700 text-[13px] font-bold px-3 py-1.5 rounded-xl border border-indigo-100"
            >
              <span class="material-symbols-outlined text-[16px]">lock</span> Є замок
            </span>
            <span
                v-else
                class="inline-flex max-[340px]:w-full items-center max-[340px]:justify-center gap-1 bg-red-50 text-red-700 text-[13px] font-bold px-3 py-1.5 rounded-xl border border-red-100"
            >
              <span class="material-symbols-outlined text-[16px]">lock_open</span> Замок зламано
            </span>
          </template>
        </div>

        <!-- 💬 Коментар користувача -->
        <div v-if="toilet.user_comment" class="mx-5 bg-amber-50/40 p-3.5 rounded-xl border border-dashed border-amber-200 mt-5">
          <p class="text-[13px] text-slate-700 italic relative font-medium">
            <span class="absolute -top-1 -left-1.5 text-amber-300 text-xl leading-none">"</span>
            <span class="pl-3">{{ toilet.user_comment }}</span>
          </p>
        </div>

        <!-- 🛠️ Інструменти адміна -->
        <div v-if="isAdmin" class="mx-5 pt-4 border-t border-slate-100 mt-3 flex gap-2">
          <button @click="emit('edit', toilet)" class="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-xl transition-colors cursor-pointer">
            <span class="material-symbols-outlined text-[18px]">edit</span> Змінити
          </button>
          <button @click="emit('move', toilet)" class="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold text-xs rounded-xl transition-colors cursor-pointer">
            <span class="material-symbols-outlined text-[18px]">distance</span> Перемістити
          </button>
          <button @click="emit('delete', toilet.id)" class="flex-[0.5] flex items-center justify-center gap-1.5 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs rounded-xl transition-colors cursor-pointer">
            <span class="material-symbols-outlined text-[18px]">delete</span>
          </button>
        </div>
      </div>

      <!-- 👈 ОСЬ ТУТ, ОДРАЗУ ПІСЛЯ СКРОЛ-БЛОКУ -->
      <div
          v-if="state !== 'expanded'"
          class="absolute bottom-0 inset-x-0 h-8 bg-linear-to-t from-white to-transparent pointer-events-none"
      ></div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 10px;
}
</style>