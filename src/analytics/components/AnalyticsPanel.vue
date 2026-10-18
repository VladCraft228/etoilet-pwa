<script setup lang="ts">
import { ref, computed, watch } from 'vue'
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
  selectedCandidateIndex?: number | null
  isLoadingNetwork?: boolean
  networkProgress?: number
  isOptimizing?: boolean
  isOptimizationOutdated?: boolean
  optimizationProgress?: number
  isSimulationMode?: boolean
  virtualToilets?: Toilet[]
}>()

const isCollapsed = ref(false)
const isRadiusChangedSinceLastCalc = ref(false)

// Відстежуємо зміну радіусу лише якщо вже є результати аналізу
watch(() => props.bufferRadiusKm, () => {
  if (props.accessibilityStats) {
    isRadiusChangedSinceLastCalc.value = true
  }
})

const categoryStats = computed(() => {
  if (!props.accessibilityStats) return []
  return calculateCategoryAccessibilityStats(props.accessibilityStats.results)
})

const topCandidates = computed<OptimizationCandidate[]>(() => {
  if (!props.optimizationSummary?.topCandidates) return []
  return props.optimizationSummary.topCandidates.slice(0, 5)
})

const emit = defineEmits<{
  (e: 'change-radius', radiusKm: number): void
  (e: 'export-csv'): void
  (e: 'export-html'): void
  (e: 'export-accessibility-csv'): void
  (e: 'export-accessibility-html'): void
  (e: 'close'): void
  (e: 'toggle-simulation'): void
  (e: 'remove-virtual', id: string): void
  (e: 'clear-virtual'): void
  (e: 'calculate-network'): void
  (e: 'run-optimization'): void
  (e: 'select-candidate', candidate: OptimizationCandidate, index: number): void
  (e: 'show-candidate', lat: number, lng: number): void
}>()

const handleRecalculate = () => {
  emit('calculate-network')
  isRadiusChangedSinceLastCalc.value = false
}

const radiusOptions = [
  { label: '300 м', km: 0.3, time: '~4 хв' },
  { label: '500 м', km: 0.5, time: '~6 хв' },
  { label: '800 м', km: 0.8, time: '~10 хв' },
]
</script>

<template>
  <div
      class="absolute top-4 right-3 z-60 w-[calc(100vw-5rem)] max-w-77.5 sm:max-w-xs sm:w-80 max-h-[55dvh] sm:max-h-[calc(100dvh-2rem)] flex flex-col bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/80 transition-all duration-300 pointer-events-auto overflow-hidden"
      :class="{ 'shadow-md max-h-12': isCollapsed }"
  >
    <!-- ШАПКА ПАНЕЛІ (Клік згортає/розгортає) -->
    <div
        class="h-12 flex items-center justify-between px-3.5 bg-white/90 backdrop-blur-md shrink-0 select-none cursor-pointer hover:bg-slate-50/80 transition-colors"
        :class="{ 'border-b border-slate-100/80': !isCollapsed }"
        @click="isCollapsed = !isCollapsed"
    >
      <div class="flex items-center gap-2">
        <span class="material-symbols-outlined text-indigo-600 text-[22px]">analytics</span>
        <h3 class="font-bold text-slate-800 text-xs sm:text-sm tracking-tight">Аналіз Доступності</h3>
      </div>

      <!-- Елементи керування у шапці -->
      <div class="flex items-center gap-1">
        <!-- Кнопка Згорнути / Розгорнути -->
        <button
            type="button"
            @click.stop="isCollapsed = !isCollapsed"
            class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 active:scale-95 transition-all cursor-pointer"
            :title="isCollapsed ? 'Розгорнути панель' : 'Згорнути панель'"
        >
          <span class="material-symbols-outlined text-[20px]">
            {{ isCollapsed ? 'expand_more' : 'expand_less' }}
          </span>
        </button>

        <!-- Кнопка Закрити -->
        <button
            type="button"
            @click.stop="emit('close')"
            class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 active:scale-95 transition-colors cursor-pointer"
            title="Закрити панель"
        >
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
    </div>

    <!-- ТІЛО ПАНЕЛІ -->
    <div v-show="!isCollapsed" class="overflow-y-auto p-2.5 sm:p-3 space-y-3 flex-1 overscroll-contain touch-pan-y scrollbar-thin">

      <!-- 1. НАЛАШТУВАННЯ ТА СИМУЛЯЦІЯ -->
      <div class="space-y-2">
        <label class="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Параметри пішої доступності</label>
        <div class="grid grid-cols-3 gap-1">
          <button
              v-for="opt in radiusOptions"
              :key="opt.km"
              type="button"
              @click="emit('change-radius', opt.km)"
              :class="[
              'py-1 px-0.5 rounded-lg text-center transition-all cursor-pointer border flex flex-col items-center justify-center',
              bufferRadiusKm === opt.km
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-600/20'
                : 'bg-white/80 text-slate-700 border-slate-200 hover:bg-slate-50'
            ]"
          >
            <span class="font-bold text-[11px] leading-tight">{{ opt.label }}</span>
            <span :class="['text-[8px]', bufferRadiusKm === opt.km ? 'text-indigo-100' : 'text-slate-400']">{{ opt.time }}</span>
          </button>
        </div>

        <!-- СИМУЛЯЦІЯ ТОЧКИ -->
        <div class="space-y-2 pt-2 border-t border-slate-100">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-bold text-slate-700 flex items-center gap-1">
              <span class="material-symbols-outlined text-amber-500 text-[16px]">add_location</span>
              Симуляція точки
            </span>

            <button
                type="button"
                @click="emit('toggle-simulation')"
                :class="[
                'px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all cursor-pointer',
                isSimulationMode
                  ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/30 animate-pulse'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              ]"
            >
              {{ isSimulationMode ? 'Клікніть мапу' : 'Увімкнути' }}
            </button>
          </div>

          <!-- СПИСОК ВІРТУАЛЬНИХ ТОЧОК ТА КНОПКА МАСОВОГО ВИДАЛЕННЯ -->
          <div v-if="virtualToilets && virtualToilets.length > 0" class="space-y-1.5 pt-1">
            <div class="flex items-center justify-between px-0.5">
              <span class="text-[10px] font-medium text-slate-500">
                Додано точок: <b class="text-amber-700">{{ virtualToilets.length }}</b>
              </span>

              <button
                  type="button"
                  @click="emit('clear-virtual')"
                  class="text-[10px] text-rose-600 hover:text-rose-700 hover:underline font-semibold flex items-center gap-0.5 cursor-pointer"
                  title="Видалити всі тестові точки"
              >
                <span class="material-symbols-outlined text-[13px]">delete</span>
                Очистити всі
              </button>
            </div>

            <div class="space-y-1 max-h-24 overflow-y-auto pr-1 custom-scrollbar">
              <div
                  v-for="(vt, idx) in virtualToilets"
                  :key="vt.id"
                  class="flex items-center justify-between px-2 py-1 bg-amber-50/90 hover:bg-amber-100/80 rounded border border-amber-200/70 text-[11px] text-amber-950 transition-colors"
              >
                <span class="font-medium flex items-center gap-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                  Тестова точка #{{ idx + 1 }}
                </span>
                <button
                    type="button"
                    @click="emit('remove-virtual', vt.id)"
                    class="text-amber-700 hover:text-rose-600 p-0.5 rounded hover:bg-amber-200/50 transition-colors cursor-pointer"
                    title="Видалити точку"
                >
                  <span class="material-symbols-outlined text-[14px] block">close</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 2. ГОЛОВНІ МЕТРИКИ ДОСТУПНОСТІ (ACCESSIBILITY) -->
      <div class="bg-indigo-50/90 p-2.5 rounded-xl border border-indigo-100 text-[11px] space-y-2 relative">

        <div v-if="isRadiusChangedSinceLastCalc" class="absolute -top-1 -right-1 z-10">
          <span class="flex h-3 w-3">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
          </span>
        </div>

        <div class="flex items-center justify-between font-bold text-indigo-950">
          <span class="flex items-center gap-1">
            <span class="material-symbols-outlined text-[16px] text-indigo-600">directions_walk</span>
            Мережева доступність
          </span>
          <span v-if="accessibilityStats" class="text-xs text-indigo-600 font-extrabold">
            {{ accessibilityStats.accessible5MinPercent }}% покрито
          </span>
        </div>

        <div v-if="isLoadingNetwork" class="space-y-1">
          <div class="w-full bg-indigo-200/60 rounded-full h-1.5 overflow-hidden">
            <div class="bg-indigo-600 h-1.5 rounded-full transition-all duration-200" :style="{ width: `${networkProgress ?? 0}%` }"></div>
          </div>
          <div class="text-[9px] text-indigo-700 text-center animate-pulse">Розрахунок маршрутів OSRM...</div>
        </div>

        <template v-else-if="accessibilityStats">
          <div v-if="isRadiusChangedSinceLastCalc" class="bg-amber-100 border border-amber-300 text-amber-900 px-2 py-1.5 rounded text-[10px] flex items-start gap-1.5 shadow-sm">
            <span class="material-symbols-outlined text-[14px] mt-0.5 shrink-0">info</span>
            <span>Радіус змінено на <b>{{ bufferRadiusKm * 1000 }}м</b>. Натисніть кнопку нижче, щоб оновити статистику.</span>
          </div>

          <div class="grid grid-cols-2 gap-2 bg-white/60 p-2 rounded-lg border border-indigo-100/50">
            <div class="text-center">
              <div class="text-[9px] text-slate-500 uppercase">Мед. час ходу</div>
              <div class="text-lg font-bold text-indigo-700">{{ accessibilityStats.medianWalkingTimeMins }} <span class="text-[10px] font-normal">хв</span></div>
            </div>
            <div class="text-center border-l border-indigo-100">
              <div class="text-[9px] text-slate-500 uppercase">Circuity Factor</div>
              <div class="text-lg font-bold text-amber-600">{{ accessibilityStats.medianCircuityFactor }}</div>
            </div>
          </div>

          <div v-if="categoryStats && categoryStats.length > 0" class="pt-1">
            <div class="text-[9px] font-bold text-slate-400 uppercase mb-1">За категоріями</div>
            <div class="overflow-x-auto rounded border border-slate-200 bg-white">
              <table class="w-full text-[9px]">
                <thead class="bg-slate-50 text-slate-500">
                <tr>
                  <th class="p-1 text-left">Кат.</th>
                  <th class="p-1 text-center">5 хв</th>
                  <th class="p-1 text-right">CF</th>
                </tr>
                </thead>
                <tbody>
                <tr v-for="stat in categoryStats" :key="stat.category" class="border-t border-slate-100">
                  <td class="p-1 font-medium text-slate-700">{{ stat.category }}</td>
                  <td class="p-1 text-center text-indigo-600 font-bold">{{ Math.round(stat.coverage5) }}%</td>
                  <td class="p-1 text-right text-slate-600">{{ stat.avgCircuity.toFixed(2) }}</td>
                </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-1 pt-1">
            <button
                type="button"
                @click="handleRecalculate"
                :class="[
                    'col-span-2 py-1.5 font-bold rounded-lg text-[10px] transition-all shadow-sm flex items-center justify-center gap-1 cursor-pointer',
                    isRadiusChangedSinceLastCalc
                      ? 'bg-amber-500 hover:bg-amber-600 text-white animate-pulse'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                ]"
            >
              <span class="material-symbols-outlined text-[14px]">refresh</span>
              <span>{{ isRadiusChangedSinceLastCalc ? 'Оновити дані (радіус змінено)' : 'Оновити розрахунок' }}</span>
            </button>

            <button
                type="button"
                @click="emit('export-accessibility-csv')"
                class="py-1.5 bg-white border border-indigo-200 hover:bg-indigo-50 text-indigo-700 font-medium rounded-lg text-[10px] transition-colors flex items-center justify-center gap-1 cursor-pointer"
            >
              <span class="material-symbols-outlined text-[14px]">table_view</span>
              CSV
            </button>

            <button
                type="button"
                @click="emit('export-accessibility-html')"
                class="py-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-800 font-medium rounded-lg text-[10px] transition-colors flex items-center justify-center gap-1 cursor-pointer"
            >
              <span class="material-symbols-outlined text-[14px]">description</span>
              HTML Звіт
            </button>
          </div>
        </template>

        <div v-else class="text-center py-2">
          <button
              type="button"
              @click="emit('calculate-network')"
              class="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-[11px] transition-all shadow-sm flex items-center justify-center gap-1 cursor-pointer"
          >
            <span class="material-symbols-outlined text-[15px]">play_arrow</span>
            <span>Розпочати аналіз доступності</span>
          </button>
        </div>
      </div>

      <!-- 3. ОПТИМІЗАЦІЯ (WHAT-IF) -->
      <div class="bg-amber-50/60 p-2 rounded-xl border border-amber-200/80 text-[11px] space-y-1.5 transition-all">
        <div class="flex items-center justify-between font-bold text-amber-950">
          <span class="flex items-center gap-1">
            <span class="material-symbols-outlined text-[16px] text-amber-600">auto_awesome</span>
            Оптимізація розміщення
          </span>

          <button
              v-if="optimizationSummary && !isOptimizing"
              type="button"
              @click="emit('run-optimization')"
              title="Повторити симуляцію"
              class="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 bg-amber-200/70 hover:bg-amber-300/80 text-amber-900 rounded font-semibold transition-all cursor-pointer"
          >
            <span class="material-symbols-outlined text-[12px]">refresh</span>
            <span>Оновити</span>
          </button>
        </div>

        <div
            v-if="isOptimizationOutdated && optimizationSummary"
            class="flex items-center gap-1 bg-amber-200/80 text-amber-900 px-2 py-1 rounded text-[9px] font-medium animate-pulse border border-amber-300"
        >
          <span class="material-symbols-outlined text-[12px] text-amber-700">warning</span>
          <span>Мережу змінено! Рекомендується оновити оптимізацію.</span>
        </div>

        <div v-if="isOptimizing" class="space-y-1 py-1">
          <div class="w-full bg-amber-200/60 rounded-full h-1.5 overflow-hidden">
            <div
                class="bg-amber-500 h-1.5 rounded-full transition-all duration-200"
                :style="{ width: `${optimizationProgress ?? 0}%` }"
            ></div>
          </div>
          <div class="text-[9px] text-amber-700 text-center animate-pulse font-medium">
            Пошук дефіцитних зон ({{ optimizationProgress }}%)...
          </div>
        </div>

        <template v-else>
          <button
              v-if="!optimizationSummary"
              type="button"
              @click="emit('run-optimization')"
              class="w-full py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg text-[11px] transition-all shadow-sm flex items-center justify-center gap-1 cursor-pointer"
          >
            <span class="material-symbols-outlined text-[15px]">tune</span>
            <span>Знайти дефіцитні зони</span>
          </button>

          <div v-else class="space-y-2">
            <div class="text-[9px] text-amber-800 bg-amber-100/50 p-1.5 rounded border border-amber-200 flex justify-between items-center">
              <span>Знайдено {{ optimizationSummary.totalCandidates }} кандидатів.</span>
              <span class="font-bold">ТОП-5 найкращих:</span>
            </div>

            <div class="overflow-x-auto rounded-lg border border-amber-200/80 bg-white shadow-sm">
              <table class="w-full text-[9px] text-left">
                <thead class="bg-amber-100/50 text-amber-900 border-b border-amber-200/60 font-semibold">
                <tr>
                  <th class="p-1 text-center">№</th>
                  <th class="p-1 text-center">Δ5</th>
                  <th class="p-1 text-center">Δ10</th>
                  <th class="p-1 text-right">Відст.</th>
                </tr>
                </thead>
                <tbody class="divide-y divide-amber-100">
                <tr
                    v-for="(cand, idx) in topCandidates"
                    :key="idx"
                    @click="emit('select-candidate', cand, idx); emit('show-candidate', cand.latitude, cand.longitude)"
                    :class="[
                      'cursor-pointer transition-colors hover:bg-amber-100/40',
                      selectedCandidateIndex === idx ? 'bg-amber-100/80 font-bold' : ''
                    ]"
                >
                  <td class="p-1 text-center">
                    <span :class="['inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[8px]', idx === 0 ? 'bg-emerald-500 text-white font-bold' : 'bg-slate-200 text-slate-700']">
                      {{ idx === 0 ? '★' : idx + 1 }}
                    </span>
                  </td>
                  <td class="p-1 text-center" :class="cand.deltaCoverage5 > 0 ? 'text-emerald-600 font-semibold' : 'text-slate-500'">
                    +{{ cand.deltaCoverage5 }}%
                  </td>
                  <td class="p-1 text-center" :class="cand.deltaCoverage10 > 0 ? 'text-emerald-600 font-semibold' : 'text-slate-500'">
                    +{{ cand.deltaCoverage10 }}%
                  </td>
                  <td class="p-1 text-right text-slate-600">
                    {{ Math.round(cand.avgWalkingDistance) }}м
                  </td>
                </tr>
                </tbody>
              </table>
            </div>
          </div>
        </template>
      </div>

      <!-- 4. ПРОСТОРОВА СТАТИСТИКА (Базова інформація) -->
      <div v-if="stats" class="bg-slate-50/80 p-2 rounded-xl border border-slate-100 space-y-1 text-[10px]">
        <div class="flex justify-between items-center border-b border-slate-200 pb-1 mb-1">
          <div class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Просторові метрики</div>
          <button @click="emit('export-html')" class="text-[9px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-0.5 cursor-pointer px-1.5 py-0.5 rounded hover:bg-indigo-50 transition-colors">
            <span class="material-symbols-outlined text-[12px]">description</span> Звіт
          </button>
        </div>
        <div class="flex justify-between"><span>Об'єктів:</span> <b>{{ stats.totalToilets }}</b></div>
        <div class="flex justify-between"><span>Сер. відстань:</span> <b>{{ stats.avgNearestNeighborDistanceMeters }} м</b></div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.scrollbar-thin {
  scrollbar-width: thin;
  scrollbar-color: rgba(99, 102, 241, 0.3) transparent;
}
.scrollbar-thin::-webkit-scrollbar { width: 4px; }
.scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
.scrollbar-thin::-webkit-scrollbar-thumb { background-color: rgba(99, 102, 241, 0.25); border-radius: 9999px; }
</style>