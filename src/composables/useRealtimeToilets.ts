// src/composables/useRealtimeToilets.ts
import { ref, onUnmounted } from 'vue'
import { supabase } from '../supabase'
import { toiletService } from '../services/toiletService'
import { useToast } from 'vue-toastification'

export function useRealtimeToilets() {
    const approvedToilets = ref<any[]>([])
    const hasNewData = ref(false)
    const toast = useToast()
    let toiletsChannel: any = null

    const loadToiletsData = async () => {
        try {
            const data = await toiletService.fetchApprovedToilets()
            if (data) approvedToilets.value = data
        } catch (error) {
            console.error('Помилка завантаження точок:', error)
        }
    }

    const refreshMapData = async () => {
        toast.info('Оновлюємо мапу...', { timeout: 1500 })
        await loadToiletsData()
        hasNewData.value = false
        toast.success('Мапа успішно оновлена!')
    }

    const initRealtime = () => {
        if (toiletsChannel) supabase.removeChannel(toiletsChannel)

        toiletsChannel = supabase
            .channel('public:toilets')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'toilets' }, (payload) => {
                let shouldAlert = false
                if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                    const newData = payload.new as { status?: string } | null
                    if (newData && newData.status === 'approved') shouldAlert = true
                }
                if (payload.eventType === 'DELETE') shouldAlert = true

                if (shouldAlert && !hasNewData.value) {
                    hasNewData.value = true
                    toast.warning('мапу було оновлено адміністратором! Оновіть сторінку.')
                }
            })
            .subscribe()
    }

    onUnmounted(() => {
        if (toiletsChannel) supabase.removeChannel(toiletsChannel)
    })

    return {
        approvedToilets,
        hasNewData,
        loadToiletsData,
        refreshMapData,
        initRealtime
    }
}