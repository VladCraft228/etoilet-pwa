<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
    defineProps<{
      variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'success'
      type?: 'button' | 'submit' | 'reset'
      disabled?: boolean
    }>(),
    {
      variant: 'primary',
      type: 'button',
      disabled: false
    }
)

const baseClasses = "w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl font-medium transition-all duration-150 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"

const variantClasses = computed(() => {
  switch (props.variant) {
    case 'secondary': return "bg-slate-100 text-slate-700 hover:bg-slate-200 active:scale-[0.98]"
    case 'outline': return "border-2 border-slate-200 text-slate-600 hover:border-slate-300 active:scale-[0.98]"
    case 'ghost': return "text-slate-400 text-sm hover:text-slate-600 !py-2 active:scale-[0.98]"
    case 'success': return "bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.98]"
    case 'primary':
    default: return "bg-indigo-600 text-white hover:bg-indigo-700 active:scale-[0.98]"
  }
})
</script>

<template>
  <button
      :type="type"
      :disabled="disabled"
      :class="[baseClasses, variantClasses]"
      v-bind="$attrs"
  >
    <slot />
  </button>
</template>