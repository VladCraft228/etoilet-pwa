// src/composables/useGeolocation.ts
import { ref } from 'vue'
import {useToast} from "vue-toastification";
const toast = useToast()


export function useGeolocation() {
    // Цей стан тепер живе тут, але буде доступний всюди, де ми викличемо функцію
    const userLocation = ref<[number, number] | null>(null)
    const isLocating = ref(false)
    // Універсальна функція, яка приймає "що робити у разі успіху"
    const getCurrentLocation = (
        onSuccess: (lat: number, lng: number) => void,
        onErrorFallback?: () => void
    ) => {
        if (!navigator.geolocation) {
            toast.error('Геолокація не підтримується вашим пристроєм або браузером.')
            return
        }

        isLocating.value = true

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords
                userLocation.value = [latitude, longitude] // Зберігаємо для маркера на карті
                isLocating.value = false

                // Викликаємо колбек і передаємо йому координати
                onSuccess(latitude, longitude)
            },
            (error) => {
                console.warn('GPS Error:', error)
                isLocating.value = false
                toast.warning('Помилка геолокації. Будь ласка, дозвольте доступ до геопозиції або знайдіть місце на карті вручну.')

                if (onErrorFallback) onErrorFallback()
            },
            { enableHighAccuracy: true }
        )
    }

    // Повертаємо змінні та функції назовні, щоб їх міг взяти App.vue
    return {
        userLocation,
        isLocating,
        getCurrentLocation
    }
}