// src/composables/useAuth.ts
import { ref } from 'vue'
import { supabase } from '../supabase'
import { useToast } from 'vue-toastification'

export function useAuth() {
    const isAdmin = ref(false)
    const toast = useToast()

    const checkAdminRole = async (userId: string) => {
        try {
            const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).single()
            isAdmin.value = profile?.role === 'admin'
        } catch (err) {
            console.error('Помилка перевірки ролі:', err)
            isAdmin.value = false
        }
    }

    // Передаємо сюди реактивну змінну currentScreen, щоб керувати навігацією при логіні
    const initAuth = async (currentScreen: { value: string }) => {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) await checkAdminRole(session.user.id)

        supabase.auth.onAuthStateChange(async (_event, session) => {
            if (session) {
                await checkAdminRole(session.user.id)
                if (isAdmin.value && currentScreen.value === 'login') currentScreen.value = 'admin'
                else if (!isAdmin.value && currentScreen.value === 'login') {
                    toast.error('У вас немає прав доступу.')
                    await supabase.auth.signOut()
                }
            } else {
                isAdmin.value = false
                if (currentScreen.value === 'admin') currentScreen.value = 'map'
            }
        })
    }

    const handleLogout = async (currentScreen: { value: string }) => {
        await supabase.auth.signOut()
        isAdmin.value = false
        currentScreen.value = 'map'
    }

    return {
        isAdmin,
        initAuth,
        handleLogout
    }
}