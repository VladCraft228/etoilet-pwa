// src/services/reportService.ts
import { supabase } from '../supabase'
import type { ToiletReport } from '../types'

export const reportService = {
    // Надіслати скаргу
    async submitToiletReport(report: ToiletReport) {
        const { data, error } = await supabase
            .from('toilet_reports')
            .insert([report])
            .select()
        if (error) throw error
        return data
    },

    // Отримати активні скарги разом із вбиральнями (Foreign Table Join)
    async fetchPendingReports() {
        const { data, error } = await supabase
            .from('toilet_reports')
            .select(`
      *,
      toilet:toilets(
        *,
        toilet_images(*)
      )
    `)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })

        if (error) throw error
        return data as (ToiletReport & { toilet: any })[]
    },

    // Оновити статус скарги ('resolved' або 'dismissed')
    async updateReportStatus(id: string, status: 'resolved' | 'dismissed') {
        const { data, error } = await supabase
            .from('toilet_reports')
            .update({ status })
            .eq('id', id)

        if (error) throw error
        return data
    }
}