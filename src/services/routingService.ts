// src/services/routingService.ts

export const routingService = {
    async getWalkingRoute(points: [number, number][]) {
        try {
            const coordinatesString = points
                .map(point => `${point[1]},${point[0]}`)
                .join(';')

            // Створюємо рядок радіусів, наприклад: "200;200" для кожної точки
            const radiusesString = points.map(() => '200').join(';')

            // Додали &radiuses=${radiusesString} у запит
            const url = `https://router.project-osrm.org/route/v1/foot/${coordinatesString}?overview=full&geometries=geojson&radiuses=${radiusesString}`

            const response = await fetch(url)
            const data = await response.json()

            if (data.routes && data.routes.length > 0) {
                const route = data.routes[0]
                const coords = route.geometry.coordinates.map((c: any) => [c[1], c[0]])

                return {
                    coords,
                    distance: route.distance,
                    duration: route.duration
                }
            }
            return null
        } catch (error) {
            console.error('Помилка побудови маршруту:', error)
            return null
        }
    }
}