<script setup lang="ts">
import { watch, onUnmounted, shallowRef, markRaw } from 'vue'
import { Marker, Popup, type Map } from 'maplibre-gl'
import type { OptimizationCandidate } from '../types/optimizationType'

const props = defineProps<{
  map: Map | null
  candidates: OptimizationCandidate[]
  selectedIndex?: number | null
  visible?: boolean
}>()

const emit = defineEmits<{
  (e: 'select-candidate', candidate: OptimizationCandidate, index: number): void
}>()

const markers = shallowRef<Marker[]>([])

function clearMarkers() {
  markers.value.forEach((m) => m.remove())
  markers.value = []
}

function renderCandidates() {
  clearMarkers()

  if (!props.map || !props.visible || !props.candidates.length) {
    return
  }

  // Обгортаємо map у markRaw, щоб розірвати Proxy
  const rawMap = markRaw(props.map)
  const newMarkers: Marker[] = []

  props.candidates.forEach((cand, index) => {
    const isTop1 = index === 0
    const isSelected = props.selectedIndex === index

    const el = document.createElement('div')
    el.className = 'candidate-marker-container cursor-pointer'
    el.style.display = 'flex'
    el.style.alignItems = 'center'
    el.style.justifyContent = 'center'
    el.style.zIndex = isSelected ? '100' : isTop1 ? '50' : '10'

    if (isTop1) {
      el.innerHTML = `
        <div class="bg-emerald-500 text-white px-2 py-1 rounded-xl border-2 border-white shadow-lg font-bold text-xs flex items-center gap-0.5">
          <span>★</span> <span>#1</span>
        </div>
      `
    } else {
      el.innerHTML = `
        <div class="w-6 h-6 ${isSelected ? 'bg-amber-500 scale-110' : 'bg-blue-500'} text-white rounded-full border-2 border-white shadow-md flex items-center justify-center font-bold text-[11px]">
          ${index + 1}
        </div>
      `
    }

    const popupHtml = `
      <div style="padding: 4px; font-size: 12px;">
        <b>${isTop1 ? '★ №1 Кандидат' : `Кандидат #${index + 1}`}</b><br/>
        Δ 5 хв: +${cand.deltaCoverage5}%<br/>
        Сер. відст: ${Math.round(cand.avgWalkingDistance)} м
      </div>
    `

    const popup = new Popup({ offset: 12, closeButton: false }).setHTML(popupHtml)

    const marker = new Marker({ element: el })
        .setLngLat([cand.longitude, cand.latitude])
        .setPopup(popup)
        .addTo(rawMap)

    el.addEventListener('click', (e) => {
      e.stopPropagation()
      emit('select-candidate', cand, index)
    })

    newMarkers.push(marker)
  })

  markers.value = newMarkers
}

watch(
    () => [props.map, props.candidates, props.selectedIndex, props.visible],
    () => renderCandidates(),
    { immediate: true }
)

onUnmounted(() => {
  clearMarkers()
})
</script>

<template>
  <div class="hidden"></div>
</template>