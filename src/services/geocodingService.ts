// src/services/geocodingService.ts

export interface GeocodeResult {
    display_name: string
    lat: number
    lng: number
}

export const geocodingService = {
    async searchAddress(query: string): Promise<GeocodeResult[]> {
        if (!query || query.trim().length < 3) return []

        try {
            // Запит до безкоштовного сервісу Nominatim
            // accept-language=uk змушує повертати назви українською
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
                    query
                )}&accept-language=uk&limit=5`
            )

            if (!response.ok) throw new Error('Помилка мережі геокодера')

            const data = await response.json()

            return data.map((item: any) => ({
                display_name: item.display_name,
                lat: parseFloat(item.lat),
                lng: parseFloat(item.lon),
            }))
        } catch (error) {
            console.error('Geocoding error:', error)
            return []
        }
    },
}