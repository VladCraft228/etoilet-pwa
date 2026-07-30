<script setup lang="ts">
defineProps<{
  currentScreen: 'map' | 'login' | 'admin'
  isAdmin: boolean
}>()

// Оголошуємо, які події цей компонент може відправляти наверх
const emit = defineEmits(['navigate', 'logout'])
</script>

<template>
  <div class="absolute top-4 left-4 z-100 flex gap-2 pointer-events-auto transition-all duration-150 [body:has(.animate-in)_&]:opacity-0 [body:has(.animate-in)_&]:pointer-events-none [body:has(.animate-in)_&]:scale-95">

    <button
        v-if="currentScreen !== 'map'"
        @click="emit('navigate', 'map')"
        class="flex items-center gap-1.5 px-3 py-2 bg-white text-slate-800 text-xs font-bold rounded-xl shadow-md border border-slate-100 hover:bg-slate-50 active:scale-95 transition-all cursor-pointer"
    >
      <span class="material-symbols-outlined text-[16px]">map</span> На мапу
    </button>

    <button
        v-if="currentScreen === 'map'"
        @click="emit('navigate', 'admin')"
        class="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl shadow-md hover:bg-indigo-700 active:scale-95 transition-all cursor-pointer"
    >
      <span class="material-symbols-outlined text-[16px]">admin_panel_settings</span>
      {{ isAdmin ? 'Адмінка' : 'Вхід для адміна' }}
    </button>

    <button
        v-if="isAdmin && currentScreen !== 'map'"
        @click="emit('logout')"
        class="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-600 text-xs font-bold rounded-xl shadow-md border border-red-100 hover:bg-red-100 active:scale-95 transition-all cursor-pointer"
    >
      <span class="material-symbols-outlined text-[16px]">logout</span> Вийти
    </button>

  </div>
</template>