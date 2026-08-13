<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  info: { distance: number; mins: number; type: 'osrm' | 'direct' } | null
  isAnalyticsActive?: boolean
  straightDistance?: number // Пряма (евклідова) відстань у метрах
}>()

const emit = defineEmits(['close'])

// Розрахунок Circuity Factor: K = OSRM / Straight
const circuityMetrics = computed(() => {
  if (
      !props.isAnalyticsActive ||
      !props.info ||
      props.info.type !== 'osrm' ||
      !props.straightDistance ||
      props.straightDistance === 0
  ) {
    return null
  }

  const factor = props.info.distance / props.straightDistance
  const detourPercent = Math.max(0, Math.round((factor - 1) * 100))

  return {
    factor: factor.toFixed(2),
    detourPercent,
    straightMeters: Math.round(props.straightDistance)
  }
})
</script>

<template>
  <div v-if="info" class="absolute top-4 left-4 right-4 z-1000 flex justify-center animate-fade-in pointer-events-none">
    <div class="bg-white/95 backdrop-blur-md shadow-xl rounded-2xl p-3.5 flex flex-col gap-2.5 w-full max-w-sm pointer-events-auto border border-slate-100">

      <!-- Основний блок маршруту -->
      <div class="flex items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <div :class="['p-2 rounded-xl text-white shadow-sm flex items-center justify-center shrink-0', info.type === 'direct' ? 'bg-amber-500' : 'bg-indigo-600']">
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

        <button @click="emit('close')" class="bg-slate-100 hover:bg-slate-200 text-slate-600 p-2 rounded-full transition-colors active:scale-95 cursor-pointer shrink-0">
          <span class="material-symbols-outlined text-[20px] block">close</span>
        </button>
      </div>

      <!-- БЛОК ГІС-АНАЛІТИКИ (з'являється лише в режимі аналітики) -->
      <div
          v-if="circuityMetrics"
          class="pt-2 border-t border-slate-100 flex items-center justify-between text-xs bg-indigo-50/60 -mx-3.5 -mb-3.5 p-2.5 px-3.5 rounded-b-2xl"
      >
        <div class="flex items-center gap-1.5 text-indigo-900 font-semibold">
          <span class="material-symbols-outlined text-[16px] text-indigo-600">straighten</span>
          <span>Пряма: {{ circuityMetrics.straightMeters }} м</span>
        </div>

        <div class="flex items-center gap-1 font-bold">
          <span class="text-slate-500 font-normal">Коеф. $K$:</span>
          <span
              :class="[
              'px-1.5 py-0.5 rounded-md text-[11px]',
              Number(circuityMetrics.factor) > 1.35
                ? 'bg-amber-100 text-amber-800'
                : 'bg-emerald-100 text-emerald-800'
            ]"
          >
            {{ circuityMetrics.factor }} (+{{ circuityMetrics.detourPercent }}%)
          </span>
        </div>
      </div>

    </div>
  </div>
</template>