<script setup lang="ts">
import BaseModal from '../ui/BaseModal.vue'
import BaseButton from '../ui/BaseButton.vue'

defineProps<{ isOpen: boolean }>()
const emit = defineEmits(['use-gps', 'use-manual', 'use-address', 'close'])
</script>

<template>
  <BaseModal :is-open="isOpen" @close="emit('close')">

    <div class="flex flex-col gap-6 p-6">

      <div class="text-center mt-2">
        <h2 class="text-xl font-bold text-slate-800">Де ви знаходитесь?</h2>
        <p class="text-slate-500 text-sm mt-2 leading-relaxed">
          Оберіть спосіб, щоб ми могли знайти найближчі вбиральні.
        </p>
      </div>

      <div class="flex flex-col gap-3">
        <BaseButton variant="primary" @click="emit('use-gps')">
          <span class="material-symbols-outlined text-[20px]">my_location</span>
          Визначити автоматично
        </BaseButton>

        <BaseButton variant="secondary" @click="emit('use-manual')">
          <span class="material-symbols-outlined text-[20px]">map</span>
          Вказати на карті
        </BaseButton>

        <BaseButton variant="outline" @click="emit('use-address')">
          <span class="material-symbols-outlined text-[20px]">search</span>
          Ввести адресу
        </BaseButton>
      </div>

      <BaseButton variant="ghost" @click="emit('close')">
        Пропустити поки що
      </BaseButton>

    </div>

  </BaseModal>
</template>