<script setup lang="ts">
import { computed } from 'vue'
import type { Toilet } from '../../types'
import type { AccessibilitySummary } from '../utils/accessibility'
import type { OptimizationSummary, OptimizationCandidate } from '../types/optimizationType'
import { calculateCategoryAccessibilityStats } from '../utils/categoryStats'

const props = defineProps<{
  bufferRadiusKm: number
  toilets: Toilet[]
  stats: {
    totalToilets: number
    avgNearestNeighborDistanceMeters: number
    minNearestDistanceMeters: number
    maxNearestDistanceMeters: number
  }
  accessibilityStats?: AccessibilitySummary | null
  optimizationSummary?: OptimizationSummary | null
  isLoadingNetwork?: boolean
  networkProgress?: number
  isOptimizing?: boolean
  optimizationProgress?: number
  isSimulationMode?: boolean
  virtualToilets?: Toilet[]
}>()

const categoryStats = computed(() => {
  if (!props.accessibilityStats) {
    return []
  }

  return calculateCategoryAccessibilityStats(
      props.accessibilityStats.results
  )
})

const emit = defineEmits<{
  (e: 'change-radius', radiusKm: number): void
  (e: 'export-csv'): void
  (e: 'export-accessibility-csv'): void
  (e: 'close'): void
  (e: 'toggle-simulation'): void
  (e: 'remove-virtual', id: string): void
  (e: 'clear-virtual'): void
  (e: 'calculate-network'): void
  (e: 'run-optimization'): void
  (e: 'select-candidate', candidate: OptimizationCandidate): void
  (e: 'show-candidate', lat: number, lng: number): void
}>()

const radiusOptions = [
  { label: '300 м', km: 0.3, time: '~4 хв' },
  { label: '500 м', km: 0.5, time: '~6 хв' },
  { label: '800 м', km: 0.8, time: '~10 хв' },
]
</script>

<template>
  <div class="absolute top-4 right-4 z-40 w-80 max-h-[calc(100vh-2rem)] overflow-y-auto bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl border border-white/50 p-4 transition-all duration-300 pointer-events-auto custom-scrollbar">
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

      <!-- БЛОК СИМУЛЯЦІЇ -->
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

      <div class="bg-amber-50/60 p-3 rounded-xl border border-amber-200/80 text-xs space-y-2">
        <div class="flex items-center justify-between font-bold text-amber-950">
    <span class="flex items-center gap-1.5">
      <span class="material-symbols-outlined text-[18px] text-amber-600">auto_awesome</span>
      Оптимізація розміщення
    </span>
          <span v-if="isOptimizing" class="text-xs font-semibold text-amber-600">
      {{ optimizationProgress ?? 0 }}%
    </span>
        </div>

        <!-- Прогресбар завантаження оптимізації -->
        <div v-if="isOptimizing" class="space-y-1">
          <div class="w-full bg-amber-200/60 rounded-full h-2 overflow-hidden">
            <div
                class="bg-amber-500 h-2 rounded-full transition-all duration-200"
                :style="{ width: `${optimizationProgress ?? 0}%` }"
            ></div>
          </div>
          <div class="text-[10px] text-amber-700 text-center animate-pulse">
            Аналіз кандидатів та розрахунок OSRM...
          </div>
        </div>

        <!-- Кнопка розрахунку оптимізації -->
        <button
            v-else
            type="button"
            @click="emit('run-optimization')"
            class="w-full py-1.5 px-3 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-semibold rounded-lg text-xs transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <span class="material-symbols-outlined text-[16px]">tune</span>
          <span>Знайти найкраще місце</span>
        </button>

        <!-- Результат оптимізації -->
        <template v-if="optimizationSummary && optimizationSummary.bestCandidate && !isOptimizing">
          <div class="pt-1.5 border-t border-amber-200/60 space-y-2">
            <div class="text-[10px] text-amber-800 font-medium flex justify-between items-center">
              <span>Проаналізовано кандидатів:</span>
              <b class="text-amber-950">{{ optimizationSummary.totalCandidates }}</b>
            </div>

            <!-- Картка найкращого кандидата -->
            <div
                @click="emit('select-candidate', optimizationSummary.bestCandidate)"
                class="p-2 bg-white rounded-lg border border-amber-300 shadow-sm cursor-pointer hover:border-amber-500 transition-all"
            >
              <div class="flex items-center justify-between text-[11px] font-bold text-amber-900 mb-1">
                <span class="flex items-center gap-1">
                  <span class="material-symbols-outlined text-[14px] text-amber-500">stars</span>
                  Найкраща точка
                </span>
                <button
                    v-if="optimizationSummary?.bestCandidate"
                    @click="emit('show-candidate', optimizationSummary.bestCandidate.latitude, optimizationSummary.bestCandidate.longitude)"
                    class="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer bg-slate-100 text-slate-600 hover:bg-slate-200"
                >
                  Показати
                </button>
              </div>

              <div class="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-slate-600">
                <div>
                  Δ 5 хв:
                  <b :class="optimizationSummary.bestCandidate.deltaCoverage5 > 0 ? 'text-emerald-600' : 'text-slate-700'">
                    +{{ optimizationSummary.bestCandidate.deltaCoverage5 }}%
                  </b>
                </div>
                <div>
                  Δ 10 хв:
                  <b :class="optimizationSummary.bestCandidate.deltaCoverage10 > 0 ? 'text-emerald-600' : 'text-slate-700'">
                    +{{ optimizationSummary.bestCandidate.deltaCoverage10 }}%
                  </b>
                </div>
                <div>
                  Сер. відстань: <b>{{ optimizationSummary.bestCandidate.avgWalkingDistance }} м</b>
                </div>
                <div>
                  Покращено точок: <b>{{ optimizationSummary.bestCandidate.improvedPoints }}</b>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- БЛОК МЕРЕЖЕВОЇ ДОСТУПНОСТІ (OSRM) -->
      <div class="bg-indigo-50/90 p-3 rounded-xl border border-indigo-100 text-xs space-y-2">
        <div class="flex items-center justify-between font-bold text-indigo-950">
    <span class="flex items-center gap-1.5">
      <span class="material-symbols-outlined text-[18px] text-indigo-600">directions_walk</span>
      Мережева доступність (OSRM)
    </span>

          <span v-if="isLoadingNetwork" class="text-xs font-bold text-indigo-600">
      {{ networkProgress ?? 0 }}%
    </span>
          <span v-else-if="accessibilityStats" class="text-sm text-indigo-600 font-extrabold">
      {{ accessibilityStats.accessible5MinPercent }}%
    </span>
        </div>

        <!-- Прогресбар під час завантаження OSRM -->
        <div v-if="isLoadingNetwork" class="space-y-1">
          <div class="w-full bg-indigo-200/60 rounded-full h-2 overflow-hidden">
            <div
                class="bg-indigo-600 h-2 rounded-full transition-all duration-200"
                :style="{ width: `${networkProgress ?? 0}%` }"
            ></div>
          </div>
          <div class="text-[10px] text-indigo-700 text-center animate-pulse">
            Обчислення пішохідних маршрутів...
          </div>
        </div>

        <!-- Кнопка ручного запуску -->
        <div v-if="!accessibilityStats && !isLoadingNetwork" class="pt-1">
          <button
              type="button"
              @click="emit('calculate-network')"
              class="w-full py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold rounded-lg text-xs transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span class="material-symbols-outlined text-[16px]">play_arrow</span>
            <span>Розрахувати доступність</span>
          </button>
        </div>

        <!-- Результати розрахунку -->
        <template v-else-if="accessibilityStats && !isLoadingNetwork">
          <div class="w-full bg-indigo-200/60 rounded-full h-2 overflow-hidden">
            <div
                class="bg-indigo-600 h-2 rounded-full transition-all duration-500"
                :style="{ width: `${accessibilityStats.accessible5MinPercent}%` }"
            ></div>
          </div>

          <div class="flex justify-between text-[11px] text-indigo-800">
            <span>Покрито: <b>{{ accessibilityStats.accessible5MinCount }}</b> з {{ accessibilityStats.totalControlPoints }}</span>
            <span class="font-semibold">(≤ 5 хв)</span>
          </div>

          <div class="pt-1.5 border-t border-indigo-100/80 grid grid-cols-2 gap-2 text-[10px] text-indigo-900">
            <div>Сер. час: <b>{{ accessibilityStats.avgWalkingTimeMins }} хв</b></div>
            <div>Сер. K: <b>{{ accessibilityStats.avgCircuityFactor }}</b></div>
          </div>

          <!-- Кнопки дій OSRM -->
          <div class="grid grid-cols-2 gap-1.5 pt-1">
            <button
                type="button"
                @click="emit('calculate-network')"
                class="py-1 px-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-medium rounded-lg text-[10px] transition-colors flex items-center justify-center gap-1 cursor-pointer"
            >
              <span class="material-symbols-outlined text-[13px]">refresh</span>
              <span>Оновити</span>
            </button>

            <button
                type="button"
                @click="emit('export-accessibility-csv')"
                class="py-1 px-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg text-[10px] transition-colors flex items-center justify-center gap-1 cursor-pointer shadow-sm"
                title="Завантажити датасет контрольних точок"
            >
              <span class="material-symbols-outlined text-[13px]">table_view</span>
              <span>OSRM CSV</span>
            </button>
          </div>
        </template>
      </div>

      <!-- Статистика за категоріями -->
      <div
          v-if="categoryStats.length > 0"
          class="bg-white p-3 rounded-xl border border-slate-200 space-y-2"
      >
        <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          Доступність за категоріями
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-[10px]">
            <thead>
            <tr class="text-slate-400 border-b border-slate-100">
              <th class="text-left py-1.5 font-semibold">Кат.</th>
              <th class="text-center py-1.5 font-semibold">N</th>
              <th class="text-center py-1.5 font-semibold">5 хв</th>
              <th class="text-center py-1.5 font-semibold">10 хв</th>
              <th class="text-right py-1.5 font-semibold">м</th>
              <th class="text-right py-1.5 font-semibold">K</th>
            </tr>
            </thead>

            <tbody>
            <tr
                v-for="stat in categoryStats"
                :key="stat.category"
                class="border-b border-slate-50 last:border-0"
            >
              <td class="py-1.5 text-slate-700 font-medium">
                {{ stat.category }}
              </td>

              <td class="py-1.5 text-center text-slate-500">
                {{ stat.count }}
              </td>

              <td class="py-1.5 text-center">
                  <span class="font-semibold text-indigo-600">
                    {{ Math.round(stat.coverage5) }}%
                  </span>
              </td>

              <td class="py-1.5 text-center">
                  <span class="font-semibold text-indigo-600">
                    {{ Math.round(stat.coverage10) }}%
                  </span>
              </td>

              <td class="py-1.5 text-right text-slate-600">
                {{ Math.round(stat.avgWalking) }}
              </td>

              <td class="py-1.5 text-right text-slate-600">
                {{ stat.avgCircuity.toFixed(2) }}
              </td>
            </tr>
            </tbody>
          </table>
        </div>

        <div class="text-[9px] text-slate-400 pt-1">
          м — середня пішохідна відстань; K — середній Circuity Factor
        </div>
      </div>

      <!-- Просторові метрики -->
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