// src/services/toiletService.ts
import { supabase } from '../supabase'

export const toiletService = {
    async addToilet(formData: any) {
        let uploadedImageUrl = null

        // 1. Завантажуємо фото в Storage одразу в папку compressed
        if (formData.imageFile) {
            const fileExt = formData.imageFile.name.split('.').pop() || 'jpeg'
            const timestamp = Date.now()

            // Магія: формуємо шлях прямо у підпапку із суфіксом _compressed
            const uploadPath = `compressed/${timestamp}_toilet_compressed.${fileExt}`

            const { error: uploadError } = await supabase.storage
                .from('toilet-photos') // перевір, щоб назва бакета збігалася (toilet-photos)
                .upload(uploadPath, formData.imageFile)

            if (uploadError) throw new Error('Не вдалося завантажити фотографію у сховище.')

            // Отримуємо публічний URL вже для цього нового шляху
            const { data: publicUrlData } = supabase.storage
                .from('toilet-photos')
                .getPublicUrl(uploadPath)

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
            urinals_count: formData.type === 'public' ? formData.urinals_count : 0,
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

    // Оновлена функція завантаження затверджених
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
    },

    // 1. Отримання вбиралень, що очікують модерації
    async fetchPendingToilets() {
        const { data, error } = await supabase
            .from('toilets')
            .select(`
                *,
                toilet_images (
                  image_url
                )
            `)
            .eq('status', 'pending')
            .order('created_at', { ascending: true })

        if (error) throw error
        return data
    },

    // 2. Зміна статусу (наприклад, переведення в 'approved')
    async updateToiletStatus(id: string, status: 'approved' | 'pending' | 'rejected') {
        const { data, error } = await supabase
            .from('toilets')
            .update({ status })
            .eq('id', id)
            .select()
            .single()

        if (error) throw error
        return data
    },

    // Оновити будь-які дані вбиральні (для редагування модератором)
    async updateToiletData(id: string, updates: any) {
        const { data, error } = await supabase
            .from('toilets')
            .update(updates)
            .eq('id', id)
            .select()
            .single()

        if (error) throw new Error(error.message)
        return data
    },

    // Оновити фото вбиральні
    async updateToiletImage(toiletId: string, imageFile: File) {
        // 1. Завантажуємо нове фото в Storage (якщо в тебе інший бакет - зміни 'toilets')
        const fileExt = imageFile.name.split('.').pop()
        const fileName = `${Date.now()}-${Math.random()}.${fileExt}`
        const filePath = `toilets/${fileName}`

        const { error: uploadError } = await supabase.storage
            .from('toilets')
            .upload(filePath, imageFile)

        if (uploadError) throw new Error(`Помилка завантаження: ${uploadError.message}`)

        // 2. Отримуємо публічне посилання
        const { data: publicUrlData } = supabase.storage
            .from('toilets')
            .getPublicUrl(filePath)

        const newImageUrl = publicUrlData.publicUrl

        // 3. Перевіряємо, чи є вже фото у цієї заявки
        const { data: existingImages } = await supabase
            .from('toilet_images')
            .select('id')
            .eq('toilet_id', toiletId)

        if (existingImages && existingImages.length > 0) {
            // Якщо є — оновлюємо URL
            await supabase.from('toilet_images').update({ image_url: newImageUrl }).eq('id', existingImages[0].id)
        } else {
            // Якщо не було — створюємо зв'язок
            await supabase.from('toilet_images').insert({ toilet_id: toiletId, image_url: newImageUrl })
        }

        return newImageUrl
    },

    // 3. Повне видалення точки з бази (каскадне видалення в DB само підчистить toilet_images, якщо налаштовано ON DELETE CASCADE)
    async deleteToilet(id: string) {
        const { error } = await supabase
            .from('toilets')
            .delete()
            .eq('id', id)

        if (error) throw error
        return true
    }
}