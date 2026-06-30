<script setup lang="ts">
import BaseModal from '../ui/BaseModal.vue'
import BaseButton from '../ui/BaseButton.vue'

defineProps<{ isOpen: boolean }>()
const emit = defineEmits(['close', 'use-google', 'use-internal'])
</script>

<template>
  <BaseModal :is-open="isOpen" @close="emit('close')">
    <div class="p-6 flex flex-col gap-6 text-center">

      <div class="mt-2">
        <h2 class="text-xl font-bold text-slate-800">Як прокласти маршрут?</h2>
        <p class="text-slate-500 text-sm mt-2 leading-relaxed">
          Виберіть найзручніший для вас додаток навігації.
        </p>
      </div>

      <div class="flex flex-col gap-4">

        <div class="flex flex-col gap-1.5 relative">
          <span class="absolute -top-2.5 right-2 bg-emerald-500 text-white text-[10px] font-black uppercase px-2 py-0.5 rounded-full z-10 shadow-sm border-2 border-white">
            Рекомендовано
          </span>
          <BaseButton variant="primary" @click="emit('use-google')" class="bg-blue-600! hover:bg-blue-700!">
            <span class="material-symbols-outlined text-[20px]">map</span>
            Google Maps
          </BaseButton>
        </div>

        <div class="flex flex-col gap-1.5 relative">
          <span class="absolute -top-2.5 right-2 bg-indigo-100 text-indigo-700 text-[10px] font-black uppercase px-2 py-0.5 rounded-full z-10 shadow-sm border-2 border-white">
            Альфа-версія
          </span>
          <BaseButton variant="outline" @click="emit('use-internal')">
            <span class="material-symbols-outlined text-[20px]">explore</span>
            Вбудована карта
          </BaseButton>
        </div>

      </div>

      <BaseButton variant="ghost" @click="emit('close')" class="mt-2">
        Скасувати
      </BaseButton>

    </div>
  </BaseModal>
</template>