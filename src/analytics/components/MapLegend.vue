<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDraggableOverlay } from '../../composables/useDraggableOverlay'
import type { ControlPoint } from '../data/controlPoints'
import type { AccessibilitySummary } from '../utils/accessibility'
import { EUCLID_COVERAGE_5_METERS, EUCLID_COVERAGE_10_METERS } from '../utils/accessibility'

const props = defineProps<{
  /** Кількість наявних (схвалених) вбиралень на мапі. */
  toiletCount: number
  /** Результати мережевого розрахунку; null, доки розрахунок не запускали. */
  accessibilityStats?: AccessibilitySummary | null
  /** Активний норматив: 5 або 10 хв. */
  threshold: 5 | 10
  /** Обрані категорії контрольних точок (порожньо = усі). */
  selectedCategories?: ControlPoint['category'][]
  /** Скільки контрольних точок зараз показано на мапі (до розрахунку). */
  visibleControlPointCount: number
  /** Кількість кандидатів оптимізації на мапі. */
  candidateCount?: number
  /** Кількість віртуальних вбиралень (симуляція). */
  virtualCount?: number
}>()

const isCollapsed = ref(false)
const {
  positionStyle,
  isDragging,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  consumeDragClick,
} = useDraggableOverlay(true)

const toggleCollapsed = () => {
  if (consumeDragClick()) return
  isCollapsed.value = !isCollapsed.value
}

// Покриття враховує лише успішно проаналізовані точки та активний фільтр категорій
const coverage = computed(() => {
  const stats = props.accessibilityStats
  if (!stats) return null

  const categories = props.selectedCategories ?? []
  const analyzed = stats.results.filter(
      (r) => r.analyzed && (categories.length === 0 || categories.includes(r.point.category))
  )
  if (analyzed.length === 0) return null

  const covered = analyzed.filter((r) =>
      props.threshold === 5 ? r.isAccessible5Min : r.isAccessible10Min
  ).length

  return {
    total: analyzed.length,
    covered,
    uncovered: analyzed.length - covered,
    percent: Math.round((covered / analyzed.length) * 100)
  }
})

const thresholdMeters = computed(() =>
    Math.round(props.threshold === 5 ? EUCLID_COVERAGE_5_METERS : EUCLID_COVERAGE_10_METERS)
)
</script>

<template>
  <div
      class="absolute left-3 top-[calc(16px+env(safe-area-inset-top))] z-40 w-56 sm:w-64 bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-white/80 pointer-events-auto select-none overflow-hidden"
      :style="positionStyle()"
      data-draggable-overlay
      role="region"
      aria-label="Легенда мапи"
  >
    <div
        class="h-12 flex items-center justify-between px-3.5 bg-white/90 backdrop-blur-md select-none cursor-grab active:cursor-grabbing touch-none hover:bg-slate-50/80 transition-colors"
        :class="{ 'cursor-grabbing': isDragging }"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerCancel"
        @click="toggleCollapsed"
        @dragstart.prevent
    >
      <div class="flex items-center gap-2">
        <span class="material-symbols-outlined text-indigo-600 text-[20px]">map</span>
        <span class="text-xs font-bold text-slate-800">Легенда мапи</span>
      </div>
      <button
          type="button"
          class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 active:scale-95 transition-all cursor-pointer"
          :aria-expanded="!isCollapsed"
          :aria-label="isCollapsed ? 'Розгорнути легенду' : 'Згорнути легенду'"
          :title="isCollapsed ? 'Розгорнути легенду' : 'Згорнути легенду'"
          @click.stop="toggleCollapsed"
      >
        <span class="material-symbols-outlined text-[20px]">
          {{ isCollapsed ? 'expand_more' : 'expand_less' }}
        </span>
      </button>
    </div>

    <div v-if="!isCollapsed" class="px-3 pb-3 pt-1 space-y-1.5 text-[11px] text-slate-700 border-t border-slate-100">
      <!-- Вбиральні -->
      <div class="flex items-center gap-2">
        <span class="w-3 h-3 rounded-full bg-emerald-500 border-2 border-white shadow shrink-0"></span>
        <span class="flex-1">Наявні вбиральні</span>
        <b class="tabular-nums">{{ toiletCount }}</b>
      </div>

      <div v-if="(virtualCount ?? 0) > 0" class="flex items-center gap-2">
        <span class="w-3 h-3 rounded-full bg-orange-500 border-2 border-white shadow shrink-0"></span>
        <span class="flex-1">Віртуальні (симуляція)</span>
        <b class="tabular-nums">{{ virtualCount }}</b>
      </div>

      <!-- Контрольні точки -->
      <template v-if="coverage">
        <div class="flex items-center gap-2">
          <span class="w-3 h-3 rounded-full border-2 border-white shadow shrink-0" style="background:#06b6d4"></span>
          <span class="flex-1">Покриті ≤ {{ threshold }} хв</span>
          <b class="tabular-nums">{{ coverage.covered }}</b>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-3 h-3 rounded-full border-2 border-white shadow shrink-0" style="background:#dc2626"></span>
          <span class="flex-1">Не покриті (дефіцит)</span>
          <b class="tabular-nums">{{ coverage.uncovered }}</b>
        </div>
        <div class="pt-1.5 mt-1 border-t border-slate-100 flex items-center justify-between font-semibold text-slate-800">
          <span>Покриття ({{ coverage.covered }} з {{ coverage.total }})</span>
          <span class="tabular-nums">{{ coverage.percent }}%</span>
        </div>
        <div class="text-[10px] text-slate-400 leading-snug">
          Норматив: ≤ {{ threshold }} хв ходьби ≈ {{ thresholdMeters }} м пішохідною мережею
        </div>
      </template>
      <div v-else class="flex items-center gap-2">
        <span class="w-3 h-3 rounded-full border-2 border-white shadow shrink-0" style="background:#06b6d4"></span>
        <span class="flex-1">Контрольні точки</span>
        <b class="tabular-nums">{{ visibleControlPointCount }}</b>
      </div>

      <!-- Кандидати оптимізації -->
      <template v-if="(candidateCount ?? 0) > 0">
        <div class="pt-1.5 mt-1 border-t border-slate-100 flex items-center gap-2">
          <span class="w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow text-[8px] font-bold text-white flex items-center justify-center shrink-0">2</span>
          <span class="flex-1">Кандидати нових вбиралень</span>
          <b class="tabular-nums">{{ candidateCount }}</b>
        </div>
        <div class="flex items-center gap-2">
          <span class="px-1 rounded-md bg-emerald-500 text-white text-[8px] font-bold border border-white shadow shrink-0">★ #1</span>
          <span class="flex-1">Найкращий кандидат</span>
        </div>
      </template>
    </div>
  </div>
</template>
