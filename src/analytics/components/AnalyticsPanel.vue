<script setup lang="ts">
import type { Toilet } from '../../types'
import type { AccessibilitySummary } from '../utils/accessibility'

defineProps<{
  bufferRadiusKm: number
  toilets: Toilet[]
  stats: {
    totalToilets: number
    avgNearestNeighborDistanceMeters: number
    minNearestDistanceMeters: number
    maxNearestDistanceMeters: number
  }
  accessibilityStats?: AccessibilitySummary | null
  isLoadingNetwork?: boolean // 👈 1. ЗМІНА: Додано проп завантаження OSRM
  isSimulationMode?: boolean
  virtualToilets?: Toilet[]
}>()

const emit = defineEmits<{
  (e: 'change-radius', radiusKm: number): void
  (e: 'export-csv'): void
  (e: 'close'): void
  (e: 'toggle-simulation'): void
  (e: 'remove-virtual', id: string): void
  (e: 'clear-virtual'): void
}>()

const radiusOptions = [
  { label: '300 м', km: 0.3, time: '~4 хв' },
  { label: '500 м', km: 0.5, time: '~6 хв' },
  { label: '800 м', km: 0.8, time: '~10 хв' },
]
</script>

<template>
  <div class="absolute top-4 right-4 z-40 w-80 bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl border border-white/50 p-4 transition-all duration-300 pointer-events-auto">
    <!-- Шапка панелі -->
    <div class="flex items-center justify-between pb-2.5 border-b border-slate-100">
      <div class="flex items-center gap-2">
        <span class="material-symbols-outlined text-indigo-600 text-[20px]">analytics</span>
        <h3 class="font-semibold text-slate-800 text-sm">ГІС Аналітика</h3>
      </div>
      <button
          type="button"
          @click="emit('close')"
          class="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          title="Закрити панель"
      >
        <span class="material-symbols-outlined text-[18px]">close</span>
      </button>
    </div>

    <!-- Тіло панелі -->
    <div class="mt-3 space-y-3">
      <!-- Вибір буфера (Геометричний радіус) -->
      <div>
        <label class="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">
          Геометричний радіус покриття
        </label>
        <div class="grid grid-cols-3 gap-1.5">
          <button
              v-for="opt in radiusOptions"
              :key="opt.km"
              type="button"
              @click="emit('change-radius', opt.km)"
              :class="[
              'py-1.5 px-1 rounded-xl text-center transition-all cursor-pointer border flex flex-col items-center justify-center gap-0.5',
              bufferRadiusKm === opt.km
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-600/20'
                : 'bg-white/80 text-slate-700 border-slate-200 hover:bg-slate-50'
            ]"
          >
            <span class="font-bold text-xs">{{ opt.label }}</span>
            <span :class="['text-[9px]', bufferRadiusKm === opt.km ? 'text-indigo-100' : 'text-slate-400']">
              {{ opt.time }}
            </span>
          </button>
        </div>
      </div>

      <!-- БЛОК СИМУЛЯЦІЇ (ЩО ЯКЩО) -->
      <div class="pt-2 border-t border-slate-100 space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <span class="material-symbols-outlined text-amber-500 text-[18px]">add_location</span>
            Симуляція нової точки
          </span>
          <button
              type="button"
              @click="emit('toggle-simulation')"
              :class="[
              'px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer',
              isSimulationMode
                ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/30 animate-pulse'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            ]"
          >
            {{ isSimulationMode ? 'Клікніть на мапу' : 'Увімкнути' }}
          </button>
        </div>

        <!-- Перелік доданих віртуальних точок -->
        <div v-if="virtualToilets && virtualToilets.length > 0" class="space-y-1.5 max-h-28 overflow-y-auto pr-1">
          <div
              v-for="(vt, idx) in virtualToilets"
              :key="vt.id"
              class="flex items-center justify-between p-1.5 bg-amber-50/80 rounded-lg border border-amber-200/60 text-xs text-amber-900"
          >
            <span>Тестова точка #{{ idx + 1 }}</span>
            <button
                type="button"
                @click="emit('remove-virtual', vt.id)"
                class="text-amber-700 hover:text-red-600 p-0.5 rounded cursor-pointer"
                title="Видалити точку"
            >
              <span class="material-symbols-outlined text-[16px] block">close</span>
            </button>
          </div>

          <button
              type="button"
              @click="emit('clear-virtual')"
              class="w-full text-center text-[11px] text-slate-400 hover:text-slate-600 py-1 cursor-pointer"
          >
            Очистити всі тестові точки
          </button>
        </div>
      </div>

      <!-- 👈 2. ЗМІНА: ОНОВЛЕНИЙ БЛОК МЕРЕЖЕВОЇ ДОСТУПНОСТІ (OSRM) -->
      <div class="bg-indigo-50/90 p-3 rounded-xl border border-indigo-100 text-xs space-y-2">
        <div class="flex items-center justify-between font-bold text-indigo-950">
          <span class="flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[18px] text-indigo-600">directions_walk</span>
            Мережева доступність (OSRM)
          </span>

          <!-- Анімований спінер під час рохрахунку OSRM -->
          <span v-if="isLoadingNetwork" class="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>
          <span v-else-if="accessibilityStats" class="text-sm text-indigo-600 font-extrabold">
            {{ accessibilityStats.accessible5MinPercent }}%
          </span>
        </div>

        <template v-if="accessibilityStats && !isLoadingNetwork">
          <div class="w-full bg-indigo-200/60 rounded-full h-2 overflow-hidden">
            <div
                class="bg-indigo-600 h-2 rounded-full transition-all duration-500"
                :style="{ width: `${accessibilityStats.accessible5MinPercent}%` }"
            ></div>
          </div>

          <div class="flex justify-between text-[11px] text-indigo-800">
            <span>Покрито: <b>{{ accessibilityStats.accessible5MinCount }}</b> з {{ accessibilityStats.totalControlPoints }} локацій</span>
            <span class="font-semibold">(≤ 5 хв пішки)</span>
          </div>

          <!-- Метрики чесного OSRM часу та коефіцієнта відхилення K -->
          <div class="pt-1.5 border-t border-indigo-100/80 grid grid-cols-2 gap-2 text-[10px] text-indigo-900">
            <div>Сер. час: <b>{{ accessibilityStats.avgWalkingTimeMins }} хв</b></div>
            <div>Сер. K: <b>{{ accessibilityStats.avgCircuityFactor }}</b></div>
          </div>
        </template>
      </div>

      <!-- Блок зібраної статистики -->
      <div class="bg-slate-50/80 p-3 rounded-xl border border-slate-100 space-y-2 text-xs">
        <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          Просторові метрики
        </div>

        <div class="flex items-center justify-between text-slate-600">
          <span>Активних об'єктів:</span>
          <span class="font-bold text-slate-800">{{ stats.totalToilets }}</span>
        </div>

        <div class="flex items-center justify-between text-slate-600">
          <span>Сер. відстань між сусідами:</span>
          <span class="font-bold text-indigo-600">{{ stats.avgNearestNeighborDistanceMeters }} м</span>
        </div>

        <div class="flex items-center justify-between text-slate-400 text-[11px]">
          <span>Мін / Макс відстані:</span>
          <span class="font-medium text-slate-600">{{ stats.minNearestDistanceMeters }}м / {{ stats.maxNearestDistanceMeters }}м</span>
        </div>
      </div>

      <!-- Кнопка завантаження CSV-звіту -->
      <button
          type="button"
          @click="emit('export-csv')"
          class="w-full py-2 px-3 bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 text-indigo-700 font-semibold rounded-xl text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer border border-indigo-100"
      >
        <span class="material-symbols-outlined text-[18px]">download</span>
        <span>Завантажити CSV-звіт</span>
      </button>
    </div>
  </div>
</template>