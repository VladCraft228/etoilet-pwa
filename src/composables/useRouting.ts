import { ref } from 'vue'
import { routingService } from '../services/routingService'

// Функція для розрахунку відстані по прямій між двома координатами (в метрах)
function getStraightDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371e3
    const p1 = lat1 * Math.PI / 180
    const p2 = lat2 * Math.PI / 180
    const dp = (lat2 - lat1) * Math.PI / 180
    const dl = (lon2 - lon1) * Math.PI / 180
    const a = Math.sin(dp / 2) * Math.sin(dp / 2) +
        Math.cos(p1) * Math.cos(p2) *
        Math.sin(dl / 2) * Math.sin(dl / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
}

export function useRouting() {
    const activeRouteCoords = ref<[number, number][] | null>(null)
    const routeInfo = ref<{ distance: number, mins: number, type: 'osrm' | 'direct' } | null>(null)

    const buildRoute = async (start: [number, number], end: [number, number]) => {
        // 1. Перевіряємо локації (квадрат Монастирського острова)
        const isEndOnIsland = end[0] > 48.4600 && end[0] < 48.4720 && end[1] > 35.0730 && end[1] < 35.0900
        const isStartOnIsland = start[0] > 48.4600 && start[0] < 48.4720 && start[1] > 35.0730 && start[1] < 35.0900

        const bridgeStart: [number, number] = [48.46491, 35.07229] // Материк
        const bridgeEnd: [number, number] = [48.46542, 35.07377]   // Острів

        // Вмикаємо хак, ТІЛЬКИ якщо ми йдемо з материка на острів
        const needsBridgeHack = isEndOnIsland && !isStartOnIsland

        // Для сервера OSRM фінішем стає початок мосту (щоб він не губився)
        const targetForOSRM = needsBridgeHack ? bridgeStart : end

        // Відправляємо тільки 2 точки, щоб OSRM не робив "вузлів"
        const route = await routingService.getWalkingRoute([start, targetForOSRM])

        let isRouteValid = false
        const straightDist = getStraightDistance(start[0], start[1], end[0], end[1])

        if (route && route.coords.length > 0) {
            const lastPoint = route.coords[route.coords.length - 1]
            const gapDistance = getStraightDistance(lastPoint[0], lastPoint[1], targetForOSRM[0], targetForOSRM[1])

            // 1. Перевіряємо, чи OSRM довів нас достатньо близько (менше 400м)
            if (gapDistance < 400) {
                // 2. НОВИЙ ФІЛЬТР АБСУРДНОСТІ (Detour Ratio)
                const detourRatio = route.distance / straightDist

                if (detourRatio > 3 && straightDist < 1000) {
                    console.warn(`Відкинуто абсурдний маршрут! Прямо: ${Math.round(straightDist)}м, в обхід: ${route.distance}м`)
                    isRouteValid = false // Бракуємо цей маршрут
                } else {
                    isRouteValid = true  // Маршрут адекватний
                }
            }
        }

        if (isRouteValid && route) {
            if (needsBridgeHack) {
                // ЗШИВАЄМО 3 ШМАТКИ: [Маршрут по набережній] + [Міст] + [Пряма лінія до туалету]
                activeRouteCoords.value = [start, ...route.coords, bridgeStart, bridgeEnd, end]

                // Сумуємо всі відстані для точного розрахунку часу
                const distBridge = getStraightDistance(bridgeStart[0], bridgeStart[1], bridgeEnd[0], bridgeEnd[1])
                const distIsland = getStraightDistance(bridgeEnd[0], bridgeEnd[1], end[0], end[1])
                const totalDist = route.distance + distBridge + distIsland

                routeInfo.value = {
                    distance: Math.round(totalDist),
                    mins: Math.ceil(totalDist / 83.3),
                    type: 'osrm'
                }
            } else {
                // Звичайний маршрут (материк -> материк)
                activeRouteCoords.value = [start, ...route.coords, end]
                routeInfo.value = {
                    distance: Math.round(route.distance),
                    mins: Math.ceil(route.distance / 83.3),
                    type: 'osrm'
                }
            }
        } else {
            // ФОЛБЕК НА ПРЯМУ ЛІНІЮ
            activeRouteCoords.value = [start, end]
            routeInfo.value = {
                distance: Math.round(straightDist),
                mins: Math.ceil(straightDist / 83.3),
                type: 'direct'
            }
            alert('Побудований маршрут занадто довгий через відсутність стежок на карті. Показуємо напрямок навпростець.')
        }

        return true
    }

    const clearRoute = () => {
        activeRouteCoords.value = null
        routeInfo.value = null
    }

    return { activeRouteCoords, routeInfo, buildRoute, clearRoute }
}