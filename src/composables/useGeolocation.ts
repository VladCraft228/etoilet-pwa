// src/composables/useGeolocation.ts
import { ref, computed, onUnmounted } from 'vue'
import { useToast } from "vue-toastification"

const toast = useToast()

// Максимально допустима похибка для пішохідної навігації (відсікає РЕБ/вишки)
const MAX_ACCEPTABLE_ACCURACY_METERS = 70

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

        // Страховка на випадок повного глушіння сигналу
        const fallbackTimer = setTimeout(() => {
            if (!hasFirstFix && isLocating.value) {
                isLocating.value = false
                toast.info('Слабкий сигнал GPS. Можливо, працюють засоби РЕБ.')
                onErrorFallback?.()
            }
        }, 12000)

        watchId.value = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude, accuracy: currentAccuracy } = position.coords

                // Якщо сигнал має похибку більше 150-200м — це гарантований збій вишки/глушіння
                if (currentAccuracy > 150) {
                    console.warn(`[GPS Filter] Відхилено сигнал низької точності: ${Math.round(currentAccuracy)}м`)
                    return
                }

                // 1. ПЕРШИЙ ФІКС
                if (!hasFirstFix) {
                    clearTimeout(fallbackTimer)
                    hasFirstFix = true
                    isLocating.value = false

                    userLocation.value = [latitude, longitude]
                    accuracy.value = currentAccuracy
                    onSuccess(latitude, longitude)
                    return
                }

                // 2. ВІДСТЕЖЕННЯ В РУСІ:
                // Приймаємо будь-які координати з адекватною для міста точністю (<= 70м).
                // Не блокуємо трекінг, якщо точність просто незначно коливається (напр. з 10м до 30м).
                if (currentAccuracy <= MAX_ACCEPTABLE_ACCURACY_METERS) {
                    userLocation.value = [latitude, longitude]
                    accuracy.value = currentAccuracy
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
                maximumAge: 0,    // Забороняємо брати закешовані 30-секундні точки
                timeout: 10000
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