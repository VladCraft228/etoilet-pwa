<script setup lang="ts">
defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits(['close'])
</script>

<template>
  <div
      v-if="isOpen"
      class="fixed inset-0 z-3000 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 transition-opacity"
      @click.self="emit('close')"
  >
    <div class="bg-white rounded-3xl w-full max-w-sm sm:max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90dvh]">
      <slot></slot>
    </div>
  </div>
</template>