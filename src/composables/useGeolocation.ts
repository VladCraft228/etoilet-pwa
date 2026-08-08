// src/composables/useGeolocation.ts
import { ref, computed, onUnmounted } from 'vue'
import { useToast } from "vue-toastification"

const toast = useToast()

export function useGeolocation() {
    const userLocation = ref<[number, number] | null>(null)
    const isLocating = ref(false)
    const accuracy = ref<number | null>(null) // Зберігаємо точність для UI при потребі
    const watchId = ref<number | null>(null)

    const startTrackingLocation = (
        onSuccess: (lat: number, lng: number) => void,
        onErrorFallback?: () => void
    ) => {
        if (!navigator.geolocation) {
            toast.error('Геолокація не підтримується вашим пристроєм.')
            return
        }

        stopTrackingLocation()
        isLocating.value = true

        let hasFirstFix = false
        let bestAccuracy = Infinity

        watchId.value = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude, accuracy: currentAccuracy } = position.coords

                // 1. ПЕРШИЙ ФІКС: приймаємо з точністю до 150м, аби негайно показати "ти приблизно тут"
                if (!hasFirstFix) {
                    if (currentAccuracy > 150) return // зовсім сміття (наприклад, по IP) ігноруємо

                    userLocation.value = [latitude, longitude]
                    accuracy.value = currentAccuracy
                    bestAccuracy = currentAccuracy
                    hasFirstFix = true
                    isLocating.value = false

                    onSuccess(latitude, longitude)
                    return
                }

                // 2. НАСТУПНІ ОНОВЛЕННЯ (GPS УТОЧНЕННЯ / РУХ):
                // Якщо точність стає кращою або вона адекватна (< 30m) — оновлюємо маркер
                if (currentAccuracy <= 30 || currentAccuracy <= bestAccuracy) {
                    userLocation.value = [latitude, longitude]
                    accuracy.value = currentAccuracy
                    bestAccuracy = Math.min(bestAccuracy, currentAccuracy)

                    onSuccess(latitude, longitude)
                } else {
                    // Ігноруємо спотворення/стрибки сигналу (наприклад, раптовий відскок на 45m)
                    console.log(`[GPS Noise Filtered] Skipped fix with accuracy: ${currentAccuracy}m`)
                }
            },
            (error) => {
                console.warn('GPS Error:', error)
                isLocating.value = false

                if (error.code === error.PERMISSION_DENIED) {
                    toast.warning('Дозвольте доступ до геолокації у налаштуваннях.')
                    onErrorFallback?.()
                } else if (error.code === error.TIMEOUT) {
                    toast.info('Слабкий GPS-сигнал. Знайдіть відкритіше місце.')
                }
            },
            {
                enableHighAccuracy: true,
                maximumAge: 2000,
                timeout: 12000
            }
        )
    }

    const stopTrackingLocation = () => {
        if (watchId.value !== null) {
            navigator.geolocation.clearWatch(watchId.value)
            watchId.value = null
            isLocating.value = false
            accuracy.value = null
        }
    }

    onUnmounted(() => {
        stopTrackingLocation()
    })

    return {
        userLocation,
        accuracy,
        isLocating,
        isTracking: computed(() => watchId.value !== null),
        startTrackingLocation,
        stopTrackingLocation
    }
}