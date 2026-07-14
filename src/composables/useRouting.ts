import { ref } from 'vue'
import { routingService } from '../services/routingService'
import { useToast } from "vue-toastification"

const toast = useToast()

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

    // Перевірка приналежності до Монастирського острова
    const checkIfOnIsland = (coords: [number, number]) => {
        return coords[0] > 48.4600 && coords[0] < 48.4720 && coords[1] > 35.0730 && coords[1] < 35.0900
    }

    const buildRoute = async (start: [number, number], end: [number, number]) => {
        const straightDist = getStraightDistance(start[0], start[1], end[0], end[1])

        const isStartOnIsland = checkIfOnIsland(start)
        const isEndOnIsland = checkIfOnIsland(end)

        const bridgeStart: [number, number] = [48.46491, 35.07229] // Материк
        const bridgeEnd: [number, number] = [48.46542, 35.07377]   // Острів

        const crossBridge = isStartOnIsland !== isEndOnIsland

        try {
            let finalCoords: [number, number][] = []
            let totalDistance = 0

            if (crossBridge) {
                // Складний випадок: зшиваємо дві частини через міст за допомогою OSRM
                if (!isStartOnIsland && isEndOnIsland) {
                    // Сценарій: Йдемо на острів
                    // 1. Маршрут по материку до початку мосту
                    const routeToBridge = await routingService.getWalkingRoute([start, bridgeStart])
                    // 2. Маршрут по острову від кінця мосту до туалету
                    const routeOnIsland = await routingService.getWalkingRoute([bridgeEnd, end])

                    const part1 = routeToBridge?.coords || [start, bridgeStart]
                    const part2 = routeOnIsland?.coords || [bridgeEnd, end]
                    const dist1 = routeToBridge?.distance || getStraightDistance(start[0], start[1], bridgeStart[0], bridgeStart[1])
                    const dist2 = routeOnIsland?.distance || getStraightDistance(bridgeEnd[0], bridgeEnd[1], end[0], end[1])
                    const bridgeDist = getStraightDistance(bridgeStart[0], bridgeStart[1], bridgeEnd[0], bridgeEnd[1])

                    finalCoords = [...part1, bridgeEnd, ...part2]
                    totalDistance = dist1 + bridgeDist + dist2
                } else {
                    // Сценарій: Йдемо з острова на материк
                    // 1. Маршрут по острову до мосту
                    const routeToBridge = await routingService.getWalkingRoute([start, bridgeEnd])
                    // 2. Маршрут по материку від мосту до фінішу
                    const routeFromBridge = await routingService.getWalkingRoute([bridgeStart, end])

                    const part1 = routeToBridge?.coords || [start, bridgeEnd]
                    const part2 = routeFromBridge?.coords || [bridgeStart, end]
                    const dist1 = routeToBridge?.distance || getStraightDistance(start[0], start[1], bridgeEnd[0], bridgeEnd[1])
                    const dist2 = routeFromBridge?.distance || getStraightDistance(bridgeStart[0], bridgeStart[1], end[0], end[1])
                    const bridgeDist = getStraightDistance(bridgeStart[0], bridgeStart[1], bridgeEnd[0], bridgeEnd[1])

                    finalCoords = [...part1, bridgeStart, ...part2]
                    totalDistance = dist1 + bridgeDist + dist2
                }
            } else {
                // Простий випадок: обидві точки на материку або обидві на острові
                const route = await routingService.getWalkingRoute([start, end])

                if (route && route.coords.length > 0) {
                    const lastCoords = route.coords[route.coords.length - 1]
                    const isAlreadyAtEnd = lastCoords[0] === end[0] && lastCoords[1] === end[1]
                    const gapDistance = getStraightDistance(lastCoords[0], lastCoords[1], end[0], end[1])

                    // Якщо OSRM зупинився далі ніж за 5 метрів від туалету, акуратно домальовуємо хвостик
                    finalCoords = isAlreadyAtEnd ? route.coords : [...route.coords, end]
                    const extraSegment = isAlreadyAtEnd ? 0 : gapDistance
                    totalDistance = route.distance + extraSegment
                } else {
                    throw new Error("OSRM returned empty route")
                }
            }

            // Записуємо готовий результат
            activeRouteCoords.value = finalCoords
            routeInfo.value = {
                distance: Math.round(totalDistance),
                mins: Math.ceil(totalDistance / 83.3),
                type: 'osrm'
            }
            return true

        } catch (err) {
            console.warn('Помилка побудови оптимального маршруту, перемикаємось на пряму лінію:', err)
        }

        // 3. ФОЛБЕК НА ПРЯМУ ЛІНІЮ (якщо все зламалося)
        activeRouteCoords.value = [start, end]
        routeInfo.value = {
            distance: Math.round(straightDist),
            mins: Math.ceil(straightDist / 83.3),
            type: 'direct'
        }
        toast.warning('Маршрут побудовано напряму через особливості ландшафту.', {
            timeout: 5000
        })
        return true
    }

    const clearRoute = () => {
        activeRouteCoords.value = null
        routeInfo.value = null
    }

    return { activeRouteCoords, routeInfo, buildRoute, clearRoute }
}