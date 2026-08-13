export interface ControlPoint {
    id: string
    name: string
    latitude: number
    longitude: number
    category: 'park' | 'embankment' | 'transport' | 'pedestrian' | 'shopping'
}

export const DNIPRO_CONTROL_POINTS: ControlPoint[] = [
    // 🌊 Набережна та Рекреаційні зони
    {
        id: 'cp-1',
        name: 'Фестивальний причал (Куля)',
        latitude: 48.46663,
        longitude: 35.0664,
        category: 'embankment'
    },
    {
        id: 'cp-2',
        name: 'Вхід на Монастирський острів (після мосту)',
        latitude: 48.46541,
        longitude: 35.07376,
        category: 'park'
    },
    {
        id: 'cp-3',
        name: 'Пляж Монастирського острова',
        latitude: 48.45980,
        longitude: 35.08375,
        category: 'park'
    },
    {
        id: 'cp-4',
        name: 'Оглядовий майданчик парку Шевченка',
        latitude: 48.46494,
        longitude: 35.06873,
        category: 'park'
    },
    {
        id: 'cp-5',
        name: 'Сквер Прибрежний (Набережна Перемоги)',
        latitude: 48.43388,
        longitude: 35.07002,
        category: 'embankment'
    },
    {
        id: 'cp-6',
        name: 'Бульвар Слави (Перемога-6)',
        latitude: 48.41312,
        longitude: 35.06524,
        category: 'embankment'
    },

    // 🚌 Транспортні вузли
    {
        id: 'cp-7',
        name: 'Площа Вокзальна (Головний вокзал)',
        latitude: 48.47558,
        longitude: 35.01593,
        category: 'transport'
    },
    {
        id: 'cp-8',
        name: 'Центральний Автовокзал',
        latitude: 48.47454,
        longitude: 35.00871,
        category: 'transport'
    },
    {
        id: 'cp-9',
        name: 'Підстанція (ТРЦ Дафі / пр. Науки)',
        latitude: 48.42575,
        longitude: 35.02324,
        category: 'transport'
    },

    // 🏙️ Пішохідні зони та Центр
    {
        id: 'cp-10',
        name: 'Європейська площа',
        latitude: 48.46570,
        longitude: 35.04736,
        category: 'pedestrian'
    },
    {
        id: 'cp-11',
        name: 'Катеринославський бульвар',
        latitude: 48.46108,
        longitude: 35.05014,
        category: 'pedestrian'
    },
    {
        id: 'cp-12',
        name: 'Парк Глоби (Центральна алея)',
        latitude: 48.47035,
        longitude: 35.03075,
        category: 'park'
    },
    {
        id: 'cp-13',
        name: 'Площа Героїв Майдану / Passage',
        latitude: 48.46448,
        longitude: 35.04743,
        category: 'shopping'
    },
    {
        id: 'cp-14',
        name: 'ТРЦ МОСТ-Сіті (Вхід)',
        latitude: 48.46621,
        longitude: 35.05021,
        category: 'shopping'
    },
    {
        id: 'cp-15',
        name: 'Дніпровський Цирк',
        latitude: 48.46843,
        longitude: 35.05358,
        category: 'pedestrian'
    }
]