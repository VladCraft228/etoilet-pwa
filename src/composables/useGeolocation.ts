// src/composables/useGeolocation.ts
import { ref, onUnmounted } from 'vue'
import { useToast } from "vue-toastification"

const toast = useToast()

export function useGeolocation() {
    const userLocation = ref<[number, number] | null>(null)
    const isLocating = ref(false)
    const watchId = ref<number | null>(null) // Зберігаємо ID відстеження

    // 1. Початок постійного відстеження (Real-time)
    const startTrackingLocation = (
        onSuccess: (lat: number, lng: number) => void,
        onErrorFallback?: () => void
    ) => {
        if (!navigator.geolocation) {
            toast.error('Геолокація не підтримується вашим пристроєм або браузером.')
            return
        }

        // Якщо вже відстежуємо — спочатку скидаємо старий watch
        stopTrackingLocation()

        isLocating.value = true

        watchId.value = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude } = position.coords
                userLocation.value = [latitude, longitude]
                isLocating.value = false

                // Колбек тепер викликатиметься постійно при русі користувача
                onSuccess(latitude, longitude)
            },
            (error) => {
                console.warn('GPS Error:', error)
                isLocating.value = false
                toast.warning('Помилка геолокації. Будь ласка, дозвольте доступ або знайдіть місце вручну.')

                if (onErrorFallback) onErrorFallback()
            },
            {
                enableHighAccuracy: true, // Максимальна точність (використовує GPS)
                maximumAge: 0,             // Не використовувати закешовану позицію
                timeout: 10000             // Очікувати відповідь не довше 10 сек
            }
        )
    }

    // 2. Функція для зупинки відстеження (щоб не садити батарею користувача)
    const stopTrackingLocation = () => {
        if (watchId.value !== null) {
            navigator.geolocation.clearWatch(watchId.value)
            watchId.value = null
            isLocating.value = false
            console.log('⏹️ Відстеження геолокації зупинено.')
        }
    }

    // Очищаємо підписку при знищенні компонента
    onUnmounted(() => {
        stopTrackingLocation()
    })

    return {
        userLocation,
        isLocating,
        isTracking: ref(watchId.value !== null), // Стан: чи активний трекінг зараз
        startTrackingLocation,
        stopTrackingLocation
    }
}