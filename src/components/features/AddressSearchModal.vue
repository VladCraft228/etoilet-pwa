<script setup lang="ts">
import { ref, watch } from 'vue'
import { geocodingService, type GeocodeResult } from '../../services/geocodingService'
import BaseModal from '../ui/BaseModal.vue' // <-- ІМПОРТУЄМО БАЗОВЕ ВІКНО

const props = defineProps<{ isOpen: boolean }>()
const emit = defineEmits(['close', 'select'])

const searchQuery = ref('')
const results = ref<GeocodeResult[]>([])
const isLoading = ref(false)
let debounceTimeout: any = null

// Автоматичний пошук при введенні тексту (Debounce 500мс)
watch(searchQuery, (newQuery) => {
  clearTimeout(debounceTimeout)
  if (newQuery.trim().length < 3) {
    results.value = []
    return
  }

  isLoading.value = true
  debounceTimeout = setTimeout(async () => {
    results.value = await geocodingService.searchAddress(newQuery)
    isLoading.value = false
  }, 500)
})

const handleSelect = (item: GeocodeResult) => {
  emit('select', item)
  searchQuery.value = ''
  results.value = []
}
</script>

<template>
  <BaseModal :is-open="isOpen" @close="emit('close')">

    <div class="p-4 border-b border-slate-100 flex items-center gap-3 bg-slate-50">
      <span class="material-symbols-outlined text-slate-400">search</span>
      <input
          v-model="searchQuery"
          type="text"
          placeholder="Введіть вулицю, місто або заклади..."
          class="flex-1 bg-transparent text-sm font-medium focus:outline-none text-slate-800"
          autofocus
      />
      <button @click="emit('close')" class="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-200 flex items-center transition-colors">
        <span class="material-symbols-outlined text-[20px]">close</span>
      </button>
    </div>

    <div class="overflow-y-auto flex-1">

      <div v-if="isLoading" class="p-8 flex justify-center">
        <div class="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>

      <div v-else-if="results.length === 0 && searchQuery.trim().length >= 3" class="p-6 text-center text-sm text-slate-400">
        Нічого не знайдено за цим запитом
      </div>

      <div v-else-if="results.length === 0" class="p-6 text-center text-xs text-slate-400 font-medium uppercase tracking-wider">
        Почніть вводити адресу (мінімум 3 символи)
      </div>

      <ul v-else class="divide-y divide-slate-50">
        <li v-for="(item, index) in results" :key="index">
          <button
              @click="handleSelect(item)"
              class="w-full p-4 text-left flex gap-3 items-start hover:bg-slate-50 active:bg-slate-100 transition-colors"
          >
            <span class="material-symbols-outlined text-indigo-500 mt-0.5">location_on</span>
            <span class="text-sm font-medium text-slate-700 leading-tight">{{ item.display_name }}</span>
          </button>
        </li>
      </ul>

    </div>
  </BaseModal>
</template>