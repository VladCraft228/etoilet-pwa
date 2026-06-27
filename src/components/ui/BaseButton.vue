<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost'
}>()

const baseClasses = "w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl font-medium transition-transform active:scale-[0.98]"

const variantClasses = computed(() => {
  switch (props.variant) {
    case 'primary': return "bg-indigo-600 text-white"
    case 'secondary': return "bg-slate-100 text-slate-700 hover:bg-slate-200"
    case 'outline': return "border-2 border-slate-200 text-slate-600 hover:border-slate-300"
    case 'ghost': return "text-slate-400 text-sm hover:text-slate-600 !py-2"
    default: return "bg-indigo-600 text-white"
  }
})
</script>

<template>
  <button :class="[baseClasses, variantClasses]">
    <slot></slot>
  </button>
</template>