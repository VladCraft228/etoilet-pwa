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