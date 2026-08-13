// src/analytics/composables/useGisAnalytics.ts
import { ref } from 'vue'
import { createBufferPolygons } from '../utils/buffers'
import { calculateCircuity } from '../utils/circuity'
import { calculateGisStats, exportGisReportCsv } from '../utils/stats'
import type { Toilet } from '../../types'

export function useGisAnalytics() {
    const isAnalyticsActive = ref(false)
    const isSimulationMode = ref(false) // 👈 Режим додавання тестових точок
    const bufferRadiusKm = ref(0.5)
    const virtualToilets = ref<Toilet[]>([]) // 👈 Масив віртуальних вбиралень

    const setBufferRadius = (radiusKm: number) => {
        bufferRadiusKm.value = radiusKm
    }

    // Додати віртуальну точку на мапі
    const addVirtualToilet = (lng: number, lat: number) => {
        const newVirtual: Toilet = {
            id: `virtual-${Date.now()}`,
            type: 'public',
            status: 'virtual',
            latitude: lat,
            longitude: lng,
            address: `Тестова точка #${virtualToilets.value.length + 1}`
        }
        virtualToilets.value.push(newVirtual)
    }

    // Видалити остання/конкретну віртуальну точку
    const removeVirtualToilet = (id: string) => {
        virtualToilets.value = virtualToilets.value.filter((t) => t.id !== id)
    }

    const clearVirtualToilets = () => {
        virtualToilets.value = []
    }

    // Отримання буферів (реальні + віртуальні вбиральні)
    const getBuffersGeoJSON = (realToilets: Toilet[]) => {
        const combinedToilets = [...realToilets, ...virtualToilets.value]
        return createBufferPolygons(combinedToilets, bufferRadiusKm.value)
    }

    const getSummaryStats = (realToilets: Toilet[]) => {
        const combinedToilets = [...realToilets, ...virtualToilets.value]
        return calculateGisStats(combinedToilets, bufferRadiusKm.value)
    }

    const downloadCsvReport = (realToilets: Toilet[]) => {
        const combinedToilets = [...realToilets, ...virtualToilets.value]
        const stats = calculateGisStats(combinedToilets, bufferRadiusKm.value)
        exportGisReportCsv(combinedToilets, stats)
    }

    return {
        isAnalyticsActive,
        isSimulationMode,
        bufferRadiusKm,
        virtualToilets,
        setBufferRadius,
        addVirtualToilet,
        removeVirtualToilet,
        clearVirtualToilets,
        getBuffersGeoJSON,
        calculateCircuity,
        getSummaryStats,
        downloadCsvReport
    }
}