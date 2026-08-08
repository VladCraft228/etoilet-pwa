// src/composables/useRouting.ts
import { ref } from 'vue'
import { routingService } from '../services/routingService'

const MAX_ROUTE_FACTOR = 3.5

function getStraightDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
) {
    const R = 6371e3
    const p1 = (lat1 * Math.PI) / 180
    const p2 = (lat2 * Math.PI) / 180
    const dp = ((lat2 - lat1) * Math.PI) / 180
    const dl = ((lon2 - lon1) * Math.PI) / 180

    const a =
        Math.sin(dp / 2) ** 2 +
        Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
}

export function useRouting() {
    const activeRouteCoords = ref<[number, number][] | null>(null)
    const routeInfo = ref<{
        distance: number
        mins: number
        type: 'osrm'
    } | null>(null)

    const buildRoute = async (
        start: [number, number],
        end: [number, number]
    ): Promise<boolean> => {
        // 💡 НЕ очищаємо activeRouteCoords.value тут,
        // щоб лінія не зникала під час ходьби (фонового оновлення GPS)

        const straightDist = getStraightDistance(
            start[0],
            start[1],
            end[0],
            end[1]
        )

        try {
            const route = await routingService.getWalkingRoute([start, end])

            if (!route || !route.coords.length) {
                console.warn('OSRM не зміг побудувати маршрут')
                // Якщо не вдалося побудувати новий, очищаємо старий
                clearRoute()
                return false
            }

            // Захист від аномальних обходів (у 3.5 рази більше прямої)
            if (route.distance > straightDist * MAX_ROUTE_FACTOR) {
                console.warn('OSRM повернув занадто довгий маршрут:', {
                    routeDistance: route.distance,
                    straightDistance: straightDist
                })
                clearRoute()
                return false
            }

            const finalCoords = [...route.coords]
            const firstCoords = finalCoords[0]
            const lastCoords = finalCoords[finalCoords.length - 1]

            // Точна доводка ліній до старту й фінішу
            const startGap = getStraightDistance(
                start[0],
                start[1],
                firstCoords[0],
                firstCoords[1]
            )
            const endGap = getStraightDistance(
                end[0],
                end[1],
                lastCoords[0],
                lastCoords[1]
            )

            if (startGap > 2) finalCoords.unshift(start)
            if (endGap > 2) finalCoords.push(end)

            const totalDistance =
                route.distance +
                (startGap > 2 ? startGap : 0) +
                (endGap > 2 ? endGap : 0)

            // 💡 Безшовна заміна старої лінії на нову:
            activeRouteCoords.value = finalCoords
            routeInfo.value = {
                distance: Math.round(totalDistance),
                mins: Math.ceil(totalDistance / 83.3), // Сер. швидкість ~5 км/год
                type: 'osrm'
            }

            return true
        } catch (error) {
            console.error('Помилка побудови маршруту:', error)
            clearRoute()
            return false
        }
    }

    const clearRoute = () => {
        activeRouteCoords.value = null
        routeInfo.value = null
    }

    return {
        activeRouteCoords,
        routeInfo,
        buildRoute,
        clearRoute
    }
}