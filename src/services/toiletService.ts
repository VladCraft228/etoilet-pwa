import { supabase } from '../supabase'

export const toiletService = {
    async addToilet(formData: any) {
        let uploadedImageUrl = null

        // 1. Завантажуємо фото в Storage прямо в корінь бакета
        if (formData.imageFile) {
            const fileExt = formData.imageFile.name.split('.').pop() || 'jpeg'
            const timestamp = Date.now()

            // Зберігаємо в корінь без підпапок і суфіксів
            const uploadPath = `${timestamp}_toilet.${fileExt}`

            const { error: uploadError } = await supabase.storage
                .from('toilet-photos')
                .upload(uploadPath, formData.imageFile)

            if (uploadError) throw new Error('Не вдалося завантажити фотографію у сховище.')

            // Отримуємо публічний URL
            const { data: publicUrlData } = supabase.storage
                .from('toilet-photos')
                .getPublicUrl(uploadPath)

            uploadedImageUrl = publicUrlData.publicUrl
        }

        // 2. Формуємо дані для таблиці toilets
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

        // 3. Записуємо туалет
        const { data: newToilet, error: toiletError } = await supabase
            .from('toilets')
            .insert(toiletData)
            .select()
            .single()

        if (toiletError) throw toiletError

        // 4. Записуємо фото в таблицю toilet_images
        if (uploadedImageUrl && newToilet) {
            const { error: imageError } = await supabase
                .from('toilet_images')
                .insert({
                    toilet_id: newToilet.id,
                    image_url: uploadedImageUrl
                })

            if (imageError) {
                console.error('Помилка запису в toilet_images:', imageError)
            }
        }

        return newToilet
    },

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

    async updateToiletCoordinates(id: string, latitude: number, longitude: number) {
        const { data, error } = await supabase
            .from('toilets')
            .update({ latitude, longitude })
            .eq('id', id)

        if (error) throw error
        return data
    },

    // Оновлення фото модератором (теж у корінь бакета)
    async updateToiletImage(toiletId: string, imageFile: File) {
        // Оскільки в компоненті ми вже згенерували чисте ім'я файлу на кшталт `id_timestamp.ext`
        // використовуємо прямо його, щоб не плодити випадкові ранд-рядки
        const fileName = imageFile.name

        // 1. Завантажуємо в корінь бакета
        const { error: uploadError } = await supabase.storage
            .from('toilet-photos')
            .upload(fileName, imageFile)

        if (uploadError) throw new Error(`Помилка завантаження: ${uploadError.message}`)

        // 2. Отримуємо публічне посилання
        const { data: publicUrlData } = supabase.storage
            .from('toilet-photos')
            .getPublicUrl(fileName)

        const newImageUrl = publicUrlData.publicUrl

        // 3. Зберігаємо посилання в БД
        const { data: existingImages } = await supabase
            .from('toilet_images')
            .select('id')
            .eq('toilet_id', toiletId)

        if (existingImages && existingImages.length > 0) {
            await supabase.from('toilet_images').update({ image_url: newImageUrl }).eq('id', existingImages[0].id)
        } else {
            await supabase.from('toilet_images').insert({ toilet_id: toiletId, image_url: newImageUrl })
        }

        return newImageUrl
    },

    async deleteToilet(id: string, imageUrls: string[] = []) {
        if (imageUrls.length > 0) {
            const filesToRemove = imageUrls
                .map(url => {
                    if (!url) return null;
                    const cleanUrl = url.split('?')[0];
                    const parts = cleanUrl.split('/toilet-photos/');
                    if (parts.length > 1) return parts[1];
                    return cleanUrl.split('/').pop() || null;
                })
                .filter(Boolean) as string[];

            if (filesToRemove.length > 0) {
                const { error: storageError } = await supabase.storage
                    .from('toilet-photos')
                    .remove(filesToRemove);

                if (storageError) {
                    console.error('Помилка Supabase Storage при видаленні:', storageError.message);
                }
            }
        }

        const { error: dbError } = await supabase
            .from('toilets')
            .delete()
            .eq('id', id);

        if (dbError) throw dbError;
    }
}