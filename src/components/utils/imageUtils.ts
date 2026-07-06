// src/utils/imageUtils.ts

/**
 * Перетворює URL оригінального зображення з Supabase на URL стиснутої мініатюри
 */
export const getThumbnailUrl = (originalUrl: string): string => {
    if (!originalUrl) return ''

    // ЯКЩО ФОТО НОВЕ: воно вже завантажене в compressed і має суфікс.
    // Просто повертаємо його без змін!
    if (originalUrl.includes('_compressed')) {
        return originalUrl
    }

    // ЛОГІКА ДЛЯ СТАРИХ ФОТО (які лежать в корені й чекають на скрипт міграції)
    const parts = originalUrl.split('/')
    const fileName = parts.pop() || ''

    const dotIndex = fileName.lastIndexOf('.')
    const baseName = dotIndex !== -1 ? fileName.substring(0, dotIndex) : fileName

    return [...parts, 'compressed', `${baseName}_compressed.jpeg`].join('/')
}