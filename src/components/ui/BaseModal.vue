<script setup lang="ts">
defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits(['close'])
</script>

<template>
  <div
      v-if="isOpen"
      class="absolute inset-0 z-2000 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
      @click.self="emit('close')"
  >
    <div class="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
      <slot></slot>
    </div>
  </div>
</template>