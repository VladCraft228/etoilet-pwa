// src/services/routingService.ts

const OSRM_FOOT_BASE = 'https://routing.openstreetmap.de/routed-foot/route/v1/driving/'
const REQUEST_TIMEOUT_MS = 8000
const MAX_ATTEMPTS = 3
const RETRY_DELAYS_MS = [600, 1500]
const MAX_CACHED_ROUTES = 100

export interface WalkingRoute {
    coords: [number, number][]
    distance: number
    duration: number
    steps: any[]
}

// Кеш геометрії в пам'яті: повторний клік по тій самій точці не робить нового запиту до публічного OSRM
const routeCache = new Map<string, WalkingRoute>()

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const cacheKey = (points: [number, number][]) =>
    points.map(([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join(';')

/**
 * Запит до OSRM із повторами. Повертає розібраний JSON для 2xx та для 4xx із тілом
 * (NoSegment / NoRoute приходять як HTTP 400), а на 429, 5xx, таймаут і мережеві збої
 * повторює запит із паузою. Після останньої спроби кидає помилку.
 */
const fetchOsrmJson = async (url: string): Promise<any | null> => {
    let lastError: unknown = null

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

        try {
            const response = await fetch(url, { signal: controller.signal })

            if (response.ok || response.status === 400 || response.status === 404) {
                return await response.json().catch(() => null)
            }

            lastError = new Error(`HTTP ${response.status}`)
        } catch (error) {
            lastError = error
        } finally {
            clearTimeout(timer)
        }

        if (attempt < MAX_ATTEMPTS - 1) {
            await sleep(RETRY_DELAYS_MS[attempt] ?? 1500)
        }
    }

    throw lastError ?? new Error('OSRM request failed')
}

export const routingService = {
    async getWalkingRoute(points: [number, number][]): Promise<WalkingRoute | null> {
        try {
            if (points.length < 2) {
                return null
            }

            const key = cacheKey(points)
            const cached = routeCache.get(key)
            if (cached) return cached

            const coordinatesString = points
                .map(([lat, lng]) => `${lng},${lat}`)
                .join(';')

            const baseUrl = `${OSRM_FOOT_BASE}${coordinatesString}`

            // 1. Перший запит — точний snapping у межах 50 м
            const radiusesString = points
                .map(() => '50')
                .join(';')

            const urlWithRadius =
                `${baseUrl}` +
                `?overview=full` +
                `&geometries=geojson` +
                `&radiuses=${radiusesString}` +
                `&steps=true` +
                `&alternatives=false`

            let data: any = await fetchOsrmJson(urlWithRadius)

            // 2. Якщо точки не знайшлися в межах 50 м (або сервер повернув NoSegment) —
            // повторюємо без обмеження радіуса
            if (!data || data.code === 'NoSegment' || data.code === 'NoRoute') {
                console.warn('OSRM: NoSegment/NoRoute при radius=50. Повторюємо без radiuses.')

                const urlWithoutRadius =
                    `${baseUrl}` +
                    `?overview=full` +
                    `&geometries=geojson` +
                    `&steps=true` +
                    `&alternatives=false`

                data = await fetchOsrmJson(urlWithoutRadius)
            }

            if (!data || data.code !== 'Ok' || !data.routes?.length) {
                console.warn('OSRM не знайшов маршрут:', data)
                return null
            }

            const route = data.routes[0]

            const coords = route.geometry.coordinates.map(
                ([lng, lat]: [number, number]) =>
                    [lat, lng] as [number, number]
            )

            const result: WalkingRoute = {
                coords,
                distance: route.distance,
                duration: route.duration,
                steps: route.legs?.flatMap(
                    (leg: any) => leg.steps ?? []
                ) ?? []
            }

            if (routeCache.size >= MAX_CACHED_ROUTES) {
                const oldestKey = routeCache.keys().next().value
                if (oldestKey !== undefined) routeCache.delete(oldestKey)
            }
            routeCache.set(key, result)

            return result

        } catch (error) {
            console.error('Помилка побудови маршруту:', error)
            return null
        }
    }
}
