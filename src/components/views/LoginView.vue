<script setup lang="ts">
import { ref } from 'vue'
import {supabase} from "../../supabase.ts";
import BaseButton from "../ui/BaseButton.vue";


const emit = defineEmits(['success', 'close'])

const email = ref('')
const password = ref('')
const errorMsg = ref('')
const isLoading = ref(false)

const handleLogin = async () => {
  try {
    errorMsg.value = ''
    isLoading.value = true

    const { error } = await supabase.auth.signInWithPassword({
      email: email.value,
      password: password.value
    })

    if (error) throw error
    emit('success')
  } catch (err: any) {
    errorMsg.value = err.message || 'Невірний логін або пароль'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="w-full h-full flex items-center justify-center p-4 font-sans bg-slate-50 relative">

    <!-- Кнопка повернення назад / закриття -->
    <button
        @click="emit('close')"
        class="absolute top-6 left-6 flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors font-medium text-sm cursor-pointer"
    >
      <span class="material-symbols-outlined text-[20px]">arrow_back</span>
    </button>

    <div class="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl border border-slate-100 relative">
      <h2 class="text-2xl font-bold text-slate-900 text-center mb-6">Вхід в адмін-панель</h2>

      <form @submit.prevent="handleLogin" class="space-y-4">
        <div>
          <label class="block text-xs font-bold text-slate-600 uppercase mb-1">Email</label>
          <input
              v-model="email"
              type="email"
              required
              class="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 text-sm transition-colors"
              placeholder="admin@toiletmap.com"
          />
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-600 uppercase mb-1">Пароль</label>
          <input
              v-model="password"
              type="password"
              required
              class="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 text-sm transition-colors"
              placeholder="••••••••"
          />
        </div>

        <p v-if="errorMsg" class="text-xs text-red-600 font-medium bg-red-50 p-2.5 rounded-lg border border-red-100">
          {{ errorMsg }}
        </p>

        <!-- Твій BaseButton -->
        <BaseButton
            type="submit"
            variant="primary"
            :disabled="isLoading"
        >
          {{ isLoading ? 'Вхід...' : 'Увійти' }}
        </BaseButton>
      </form>
    </div>
  </div>
</template>