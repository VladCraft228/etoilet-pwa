// src/composables/useGeolocation.ts
import { ref, computed, onUnmounted } from 'vue'
import { useToast } from "vue-toastification"

const toast = useToast()

export function useGeolocation() {
    const userLocation = ref<[number, number] | null>(null)
    const isLocating = ref(false)
    const accuracy = ref<number | null>(null)
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

        // Страховка: якщо пристрій думає довше 10 секунд і не дав жодної точки — знімаємо спінер
        const fallbackTimer = setTimeout(() => {
            if (!hasFirstFix && isLocating.value) {
                isLocating.value = false
                toast.info('Не вдалося отримати точний сигнал. Спробуйте оновити пізніше.')
                onErrorFallback?.()
            }
        }, 10000)

        watchId.value = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude, accuracy: currentAccuracy } = position.coords

                // 1. ПЕРШИЙ ФІКС: приймаємо БУДЬ-ЯКУ першу точку миттєво!
                // Це знімає вічний лоадер на ПК та в приміщеннях.
                if (!hasFirstFix) {
                    clearTimeout(fallbackTimer)
                    hasFirstFix = true
                    isLocating.value = false

                    userLocation.value = [latitude, longitude]
                    accuracy.value = currentAccuracy
                    bestAccuracy = currentAccuracy

                    onSuccess(latitude, longitude)
                    return
                }

                // 2. ПОДАЛЬШЕ УТОЧНЕННЯ (коли пристрій рухається або сигнал став кращим)
                // Оновлюємо, якщо точність краща за попередню, або якщо сигнал дуже точний (<= 25m)
                if (currentAccuracy < bestAccuracy || currentAccuracy <= 25) {
                    userLocation.value = [latitude, longitude]
                    accuracy.value = currentAccuracy
                    bestAccuracy = Math.min(bestAccuracy, currentAccuracy)

                    onSuccess(latitude, longitude)
                }
            },
            (error) => {
                clearTimeout(fallbackTimer)
                console.warn('GPS Error:', error)
                isLocating.value = false

                if (error.code === error.PERMISSION_DENIED) {
                    toast.warning('Дозвольте доступ до геолокації у налаштуваннях.')
                    onErrorFallback?.()
                } else if (error.code === error.TIMEOUT) {
                    toast.info('Час очікування геопозиції минув.')
                    onErrorFallback?.()
                } else {
                    onErrorFallback?.()
                }
            },
            {
                enableHighAccuracy: true,
                maximumAge: 30000, // Дозволяємо браузеру віддати позицію за останні 30с — це дає миттєвий результат
                timeout: 10000     // 10 секунд на пошук
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