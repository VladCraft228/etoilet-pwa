// src/services/toiletService.ts
import { supabase } from '../supabase'

export const toiletService = {
    async addToilet(formData: any) {
        let uploadedImageUrl = null

        // 1. Завантажуємо фото в Storage (це залишається без змін)
        if (formData.imageFile) {
            const fileExt = formData.imageFile.name.split('.').pop()
            const fileName = `${Date.now()}_toilet.${fileExt}`

            const {error: uploadError } = await supabase.storage
                .from('toilet-photos')
                .upload(fileName, formData.imageFile)

            if (uploadError) throw new Error('Не вдалося завантажити фотографію у сховище.')

            const { data: publicUrlData } = supabase.storage
                .from('toilet-photos')
                .getPublicUrl(fileName)

            uploadedImageUrl = publicUrlData.publicUrl
        }

        // 2. Формуємо дані для таблиці toilets (без поля image_url!)
        const toiletData = {
            type: formData.type,
            latitude: formData.coords[0],
            longitude: formData.coords[1],
            has_washbasin: formData.has_washbasin,
            user_comment: formData.comment,
            has_wheelchair_accessible: formData.type === 'public' ? formData.has_wheelchair_accessible : false,
            price: formData.type === 'public' ? formData.price : 0,
            work_hours: formData.type === 'public' ? formData.work_hours : null,
            stalls_count: formData.type === 'public' ? formData.stalls_count : null,
            is_lock_broken: formData.type === 'bio' ? formData.is_lock_broken : false,
        }

        // 3. Записуємо туалет і ОБОВ'ЯЗКОВО просимо повернути його ID (.select().single())
        const { data: newToilet, error: toiletError } = await supabase
            .from('toilets')
            .insert(toiletData)
            .select()
            .single()

        if (toiletError) throw toiletError

        // 4. Якщо було фото, записуємо його в правильну таблицю toilet_images
        if (uploadedImageUrl && newToilet) {
            const { error: imageError } = await supabase
                .from('toilet_images')
                .insert({
                    toilet_id: newToilet.id, // Прив'язуємо фото до конкретного туалету
                    image_url: uploadedImageUrl
                })

            if (imageError) {
                console.error('Помилка запису в toilet_images:', imageError)
            }
        }

        return newToilet
    },

    // Оновлена функція завантаження
    async fetchApprovedToilets() {
        const { data, error } = await supabase
            .from('toilets')
            .select(`
        *,
        toilet_images (
          image_url
        )
      `)
            .eq('status', 'approved')

        if (error) throw error
        return data
    }
}