// src/analytics/composables/useGisAnalytics.ts
import { ref } from 'vue'
import { createBufferPolygons } from '../utils/buffers'
import { calculateCircuity } from '../utils/circuity'
import { calculateGisStats, exportGisReportCsv } from '../utils/stats'
import { DNIPRO_CONTROL_POINTS } from '../data/controlPoints'
import {
    evaluateControlPointsAccessibilityNetwork,
    type AccessibilitySummary
} from '../utils/accessibility'
import type { Toilet } from '../../types'

export function useGisAnalytics() {
    const isAnalyticsActive = ref(false)
    const isSimulationMode = ref(false)
    const isCalculatingNetwork = ref(false) // 👈 Лоадинг під час запитів OSRM
    const bufferRadiusKm = ref(0.5)
    const virtualToilets = ref<Toilet[]>([])

    // Зберігаємо пораховану асинхронну статистику
    const accessibilityNetworkStats = ref<AccessibilitySummary | null>(null)

    const setBufferRadius = (radiusKm: number) => {
        bufferRadiusKm.value = radiusKm
    }

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

    const removeVirtualToilet = (id: string) => {
        virtualToilets.value = virtualToilets.value.filter((t) => t.id !== id)
    }

    const clearVirtualToilets = () => {
        virtualToilets.value = []
    }

    // Запуск реального OSRM перерахунку для контрольних точок
    const recalculateNetworkAccessibility = async (realToilets: Toilet[]) => {
        isCalculatingNetwork.value = true
        const combinedToilets = [...realToilets, ...virtualToilets.value]

        try {
            const stats = await evaluateControlPointsAccessibilityNetwork(
                DNIPRO_CONTROL_POINTS,
                combinedToilets
            )
            accessibilityNetworkStats.value = stats
        } finally {
            isCalculatingNetwork.value = false
        }
    }

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
        isCalculatingNetwork,
        bufferRadiusKm,
        virtualToilets,
        controlPoints: DNIPRO_CONTROL_POINTS,
        accessibilityNetworkStats,
        setBufferRadius,
        addVirtualToilet,
        removeVirtualToilet,
        clearVirtualToilets,
        recalculateNetworkAccessibility, // 👈 Асинхронна функція
        getBuffersGeoJSON,
        calculateCircuity,
        getSummaryStats,
        downloadCsvReport
    }
}