<script setup lang="ts">
import { ref } from 'vue'

defineProps<{
  currentScreen: 'map' | 'login' | 'admin'
  isAdmin: boolean
  isAnalyticsActive: boolean
}>()

const emit = defineEmits<{
  (e: 'navigate', screen: 'map' | 'login' | 'admin'): void
  (e: 'logout'): void
  (e: 'toggle-analytics'): void
}>()

const isMenuOpen = ref(false)

const handleNavigate = (screen: 'map' | 'login' | 'admin') => {
  isMenuOpen.value = false
  emit('navigate', screen)
}

const handleLogout = () => {
  isMenuOpen.value = false
  emit('logout')
}
</script>

<template>
  <!-- Позиція адаптивна: на мапі — внизу зліва, в адмінці — класично вгорі зліва -->
  <div
      :class="[
      'z-60 flex items-start gap-2 pointer-events-auto select-none transition-all duration-150 [body:has(.animate-in)_&]:opacity-0 [body:has(.animate-in)_&]:pointer-events-none [body:has(.animate-in)_&]:scale-95',
      currentScreen === 'map'
        ? 'absolute bottom-6 left-6 pb-[env(safe-area-inset-bottom)]'
        : 'absolute top-4 left-4'
    ]"
  >
    <!-- Кнопка «На мапу» в адмінці/логіні -->
    <button
        v-if="currentScreen !== 'map'"
        @click="handleNavigate('map')"
        class="flex items-center gap-1.5 px-3.5 py-2.5 bg-white text-slate-800 text-xs font-bold rounded-2xl shadow-lg border border-slate-200/80 hover:bg-slate-50 active:scale-95 transition-all cursor-pointer"
    >
      <span class="material-symbols-outlined text-[18px]">arrow_back</span>
      <span>На мапу</span>
    </button>

    <!-- Головна кнопка Бургер-меню (на екрані карти) -->
    <div v-if="currentScreen === 'map'" class="relative">
      <button
          type="button"
          @click="isMenuOpen = !isMenuOpen"
          class="w-12 h-12 flex items-center justify-center bg-white/95 backdrop-blur-md text-slate-700 rounded-2xl shadow-xl border border-slate-200/80 hover:bg-slate-50 active:scale-95 transition-all cursor-pointer"
          :class="{ 'ring-2 ring-indigo-500': isMenuOpen }"
          aria-label="Головне меню"
      >
        <span class="material-symbols-outlined text-[26px]">
          {{ isMenuOpen ? 'close' : 'menu' }}
        </span>
      </button>

      <!-- Бекдроп -->
      <div
          v-if="isMenuOpen"
          class="fixed inset-0 z-40 bg-transparent"
          @click="isMenuOpen = false"
      ></div>

      <!-- Спливаюче вікно меню (відкривається ВГОРУ від кнопки) -->
      <transition
          enter-active-class="transition duration-150 ease-out"
          enter-from-class="opacity-0 translate-y-3 scale-95"
          enter-to-class="opacity-100 translate-y-0 scale-100"
          leave-active-class="transition duration-100 ease-in"
          leave-from-class="opacity-100 translate-y-0 scale-100"
          leave-to-class="opacity-0 translate-y-3 scale-95"
      >
        <div
            v-if="isMenuOpen"
            class="absolute bottom-15 left-0 w-72 bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200/90 p-3 flex flex-col gap-2 z-50 origin-bottom-left"
        >

          <!-- СЕКЦІЯ 1: ГІС-АНАЛІТИКА -->
          <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <span class="material-symbols-outlined text-indigo-600 text-[22px]">analytics</span>
              <div>
                <p class="text-xs font-bold text-slate-800 leading-tight">ГІС-аналітика</p>
                <p class="text-[10px] text-slate-400">Шар буферів та ТОП-5</p>
              </div>
            </div>

            <!-- Тумблер активації режиму -->
            <button
                type="button"
                @click="emit('toggle-analytics')"
                class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
                :class="isAnalyticsActive ? 'bg-indigo-600' : 'bg-slate-200'"
            >
              <span
                  class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out"
                  :class="isAnalyticsActive ? 'translate-x-5' : 'translate-x-0'"
              />
            </button>
          </div>

          <div class="h-px bg-slate-100 my-0.5"></div>

          <!-- СЕКЦІЯ 2: АДМІНІСТРАТОР -->
          <div class="flex flex-col gap-1">
            <button
                v-if="!isAdmin"
                type="button"
                @click="handleNavigate('admin')"
                class="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 active:bg-slate-200 transition-colors cursor-pointer"
            >
              <span class="material-symbols-outlined text-slate-500 text-[20px]">admin_panel_settings</span>
              <span>Вхід для адміна</span>
            </button>

            <template v-else>
              <button
                  type="button"
                  @click="handleNavigate('admin')"
                  class="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 active:bg-slate-200 transition-colors cursor-pointer"
              >
                <span class="material-symbols-outlined text-indigo-600 text-[20px]">dashboard</span>
                <span>Панель адміна</span>
              </button>

              <button
                  type="button"
                  @click="handleLogout"
                  class="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left text-xs font-semibold text-rose-600 hover:bg-rose-50 active:bg-rose-100 transition-colors cursor-pointer"
              >
                <span class="material-symbols-outlined text-rose-500 text-[20px]">logout</span>
                <span>Вийти з акаунта</span>
              </button>
            </template>
          </div>
        </div>
      </transition>
    </div>

    <!-- Кнопка швидкого виходу в адмінці -->
    <button
        v-if="isAdmin && currentScreen !== 'map'"
        @click="emit('logout')"
        class="flex items-center gap-1.5 px-3.5 py-2.5 bg-rose-50 text-rose-600 text-xs font-bold rounded-2xl shadow-lg border border-rose-100 hover:bg-rose-100 active:scale-95 transition-all cursor-pointer"
    >
      <span class="material-symbols-outlined text-[18px]">logout</span>
      <span>Вийти</span>
    </button>
  </div>
</template>