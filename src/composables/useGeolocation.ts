// src/composables/useGeolocation.ts
import { ref } from 'vue'

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
            alert('Геолокація не підтримується вашим пристроєм або браузером.')
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
                alert('Помилка геолокації. Дозвольте доступ до місцезнаходження або посуньте карту вручну.')

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