// src/utils/imageUtils.ts

/**
 * Перетворює URL оригінального зображення з Supabase на URL стиснутої мініатюри
 */
export const getThumbnailUrl = (originalUrl: string): string => {
    if (!originalUrl) return ''

    const parts = originalUrl.split('/')
    const fileName = parts.pop() || ''

    const dotIndex = fileName.lastIndexOf('.')
    const baseName = dotIndex !== -1 ? fileName.substring(0, dotIndex) : fileName

    return [...parts, 'compressed', `${baseName}_compressed.jpeg`].join('/')
}