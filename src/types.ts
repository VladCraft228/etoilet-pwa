export interface ToiletImage {
    id?: string
    toilet_id?: string
    image_url: string
    created_at?: string
}

export interface Toilet {
    id: string
    type: 'public' | 'bio'
    status?: 'pending' | 'approved' | 'rejected' | string
    latitude?: number
    longitude?: number
    address?: string
    work_hours?: string
    price?: number
    stalls_count?: number
    urinals_count?: number
    has_wheelchair_accessible?: boolean
    is_lock_broken?: boolean
    has_washbasin?: boolean
    cleanliness_rating?: number
    user_comment?: string
    moderator_comment?: string
    created_at?: string
    toilet_images?: ToiletImage[]
}

export type ReportReason =
    | 'does_not_exist'
    | 'accessibility_issue'
    | 'closed_or_broken'
    | 'wrong_info'
    | 'other'

export interface ToiletReport {
    id?: string
    toilet_id: string
    reasons: ReportReason[]
    comment?: string
    status?: 'pending' | 'resolved' | 'dismissed'
    created_at?: string
}

export const REPORT_REASONS_LABELS: Record<ReportReason, { title: string; icon: string }> = {
    does_not_exist: {
        title: 'Вбиральні немає на місці (демонтовано)',
        icon: 'location_off'
    },
    accessibility_issue: {
        title: 'Не відповідає інклюзивності (немає пандуса/візка)',
        icon: 'accessible'
    },
    closed_or_broken: {
        title: 'Зачинено або несправний замок',
        icon: 'lock_open_right'
    },
    wrong_info: {
        title: 'Невірна інформація (ціна, графік)',
        icon: 'info'
    },
    other: {
        title: 'Інша проблема',
        icon: 'report'
    }
}