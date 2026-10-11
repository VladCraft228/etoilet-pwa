// Сама функція валідації
import type {ToiletFormData} from "../../types.ts";

export const validateToiletForm = (form: ToiletFormData, hasPhoto: boolean): string | null => {
    // 1. Загальне базове правило: вбиральня повинна мати візуальний або текстовий орієнтир
    const hintText = (form.location_hint ?? '').trim()

    if (!hasPhoto && !hintText) {
        return 'Додайте фото або опис-орієнтир, щоб вбиральню можна було знайти на місцевості.'
    }

    // 2. Специфічна валідація для громадських вбиралень
    if (form.type === 'public') {
        if (!form.work_hours?.trim()) {
            return 'Будь ласка, вкажіть години роботи (наприклад, 08:00 - 22:00 або Цілодобово).'
        }
        if (form.price === null || form.price < 0) {
            return 'Будь ласка, вкажіть коректну вартість (0, якщо безкоштовно).'
        }
        if (!form.stalls_count || form.stalls_count < 1) {
            return 'Кількість кабінок не може бути меншою за 1.'
        }
    }

    return null
}