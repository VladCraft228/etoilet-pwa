// src/utils/validators.ts

// Описуємо структуру нашої форми
export interface ToiletFormData {
    type: 'public' | 'bio'
    has_washbasin: boolean
    has_wheelchair_accessible: boolean
    price: number
    work_hours: string
    stalls_count: number
    is_lock_broken: boolean
    comment: string
}

// Сама функція валідації
export const validateToiletForm = (form: ToiletFormData, hasPhoto: boolean): string | null => {
    // Валідація для громадських
    if (form.type === 'public') {
        if (!form.work_hours.trim()) {
            return 'Будь ласка, вкажіть години роботи (наприклад, 08:00 - 22:00).'
        }
        if (form.price === null || form.price < 0) {
            return 'Будь ласка, вкажіть коректну ціну (0, якщо безкоштовно).'
        }
        if (!form.stalls_count || form.stalls_count < 1) {
            return 'Кількість кабінок не може бути меншою за 1.'
        }
    }

    // Валідація для біотуалетів
    if (form.type === 'bio') {
        if (!hasPhoto && !form.comment.trim()) {
            return 'Для біотуалету обов’язково додайте фото або опис-орієнтир, щоб його можна було знайти.'
        }
    }

    // Якщо всі перевірки пройдені успішно, повертаємо null (помилок немає)
    return null
}