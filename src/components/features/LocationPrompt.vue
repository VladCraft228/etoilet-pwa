<script setup lang="ts">
import BaseModal from '../ui/BaseModal.vue'
import BaseButton from '../ui/BaseButton.vue'

defineProps<{ isOpen: boolean }>()
const emit = defineEmits(['use-gps', 'use-manual', 'use-address', 'close'])
</script>

<template>
  <BaseModal :is-open="isOpen" @close="emit('close')">
    <div class="flex flex-col gap-5">
      <div class="text-center">
        <h2 class="text-xl font-bold text-slate-800">Де ви знаходитесь?</h2>
        <p class="text-slate-500 text-sm mt-2">Оберіть спосіб, щоб ми могли знайти найближчі вбиральні.</p>
      </div>

      <div class="flex flex-col gap-3 mt-2">
        <BaseButton variant="primary" @click="emit('use-gps')">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" /></svg>
          Визначити автоматично
        </BaseButton>

        <BaseButton variant="secondary" @click="emit('use-manual')">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" /></svg>
          Вказати на карті
        </BaseButton>

        <BaseButton variant="outline" @click="emit('use-address')">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>
          Ввести адресу
        </BaseButton>
      </div>

      <BaseButton variant="ghost" @click="emit('close')" class="mt-2">
        Пропустити поки що
      </BaseButton>
    </div>
  </BaseModal>
</template>