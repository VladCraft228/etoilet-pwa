<script setup lang="ts">
// Приймаємо дані про конкретний туалет як пропс
defineProps<{ toilet: any }>()
const emit = defineEmits(['build-route'])
</script>

<template>
  <div class="flex flex-col gap-1 min-w-[170px] font-sans">

    <div v-if="toilet.toilet_images && toilet.toilet_images.length > 0" class="mb-2 -mt-1 overflow-hidden rounded-t-lg">
      <img :src="toilet.toilet_images[0].image_url" class="w-full h-36 object-cover" alt="Фото вбиральні" />
    </div>

    <h3 class="font-bold text-slate-800 text-base">
      {{ toilet.type === 'public' ? 'Громадська вбиральня' : 'Біотуалет' }}
    </h3>

    <div v-if="toilet.type === 'public'" class="text-xs text-slate-600 space-y-1.5 mt-0.5">
      <p v-if="toilet.price === 0" class="text-emerald-600 font-bold text-sm">Безкоштовно</p>
      <p v-else class="font-semibold text-slate-700">Ціна: {{ toilet.price }} грн</p>

      <div class="flex flex-wrap items-center justify-between gap-2 w-full mt-1">
        <p v-if="toilet.work_hours" class="flex items-center gap-1 text-slate-500">
          <span class="material-symbols-outlined text-[14px]">schedule</span>
          {{ toilet.work_hours }}
        </p>

        <div class="flex items-center gap-2.5 text-slate-500 bg-slate-50 px-2 py-1 rounded-md border border-slate-100" :class="{ 'ml-auto': !toilet.work_hours }">
          <span class="flex items-center gap-0.5" title="Кабінки">
            <span class="material-symbols-outlined text-[14px]">door_front</span>
            <b class="text-slate-700">{{ toilet.stalls_count || 1 }}</b>
          </span>
          <span v-if="toilet.urinals_count > 0" class="flex items-center gap-0.5" title="Пісуари">
            <span class="material-symbols-outlined text-[14px]">man</span>
            <b class="text-slate-700">{{ toilet.urinals_count }}</b>
          </span>
        </div>
      </div>
    </div>

    <div v-if="toilet.type === 'bio'" class="text-xs">
      <p v-if="toilet.user_comment" class="text-slate-600 italic">«{{ toilet.user_comment }}»</p>
    </div>

    <div class="flex flex-wrap gap-1 mt-2">
      <span v-if="toilet.has_wheelchair_accessible" class="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-md border border-emerald-100">
        <span class="material-symbols-outlined text-[12px]">accessible</span>
        Доступно для людей з інвалідністю
      </span>
      <span v-else class="inline-flex items-center gap-1 w-full bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded-md">
        <span class="material-symbols-outlined text-[12px] text-slate-400">not_accessible</span>
        Не облаштовано для візків
      </span>

      <span v-if="toilet.has_washbasin" class="inline-flex items-center gap-1 bg-blue-50 text-blue-600 text-[10px] font-bold px-2 py-0.5 rounded-md">
        <span class="material-symbols-outlined text-[12px]">soap</span>
        Рукомийник
      </span>

      <span v-if="toilet.type === 'bio' && !toilet.is_lock_broken" class="inline-flex items-center gap-1 bg-indigo-50 text-indigo-600 text-[10px] font-bold px-2 py-0.5 rounded-md">
        <span class="material-symbols-outlined text-[12px]">lock</span>
        Є замок
      </span>
      <span v-if="toilet.type === 'bio' && toilet.is_lock_broken" class="inline-flex items-center gap-1 bg-red-50 text-red-600 text-[10px] font-bold px-2 py-0.5 rounded-md">
        <span class="material-symbols-outlined text-[12px]">lock_open</span>
        Замок зламано
      </span>
    </div>

    <div class="flex flex-col gap-1 min-w-[170px] font-sans">
      <button
          @click="emit('build-route', toilet)"
          class="mt-2 w-full flex items-center justify-center gap-1.5 bg-indigo-600 text-white text-xs font-bold py-2 rounded-lg hover:bg-indigo-700 active:scale-95 transition-all shadow-sm"
      >
        <span class="material-symbols-outlined text-[16px]">directions_walk</span>
        Маршрут сюди
      </button>
    </div>

  </div>
</template>