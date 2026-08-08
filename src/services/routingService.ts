// src/services/routingService.ts

export const routingService = {
    async getWalkingRoute(points: [number, number][]) {
        try {
            if (points.length < 2) {
                return null
            }

            const coordinatesString = points
                .map(([lat, lng]) => `${lng},${lat}`)
                .join(';')

            const baseUrl =
                `https://routing.openstreetmap.de/routed-foot/route/v1/driving/` +
                `${coordinatesString}`

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

            let response = await fetch(urlWithRadius)
            let data: any = null

            if (response.ok) {
                data = await response.json()
            }

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

                response = await fetch(urlWithoutRadius)

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`)
                }

                data = await response.json()
            }

            if (data.code !== 'Ok' || !data.routes?.length) {
                console.warn('OSRM не знайшов маршрут:', data)
                return null
            }

            const route = data.routes[0]

            const coords = route.geometry.coordinates.map(
                ([lng, lat]: [number, number]) =>
                    [lat, lng] as [number, number]
            )

            return {
                coords,
                distance: route.distance,
                duration: route.duration,
                steps: route.legs?.flatMap(
                    (leg: any) => leg.steps ?? []
                ) ?? []
            }

        } catch (error) {
            console.error('Помилка побудови маршруту:', error)
            return null
        }
    }
}