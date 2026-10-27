/**
 * Утримує екран увімкненим під час довгих розрахунків (OSRM, оптимізація).
 * Без цього телефон гасить екран, браузер заморожує вкладку, і запити зупиняються.
 * Wake Lock автоматично знімається, коли вкладку згорнули, тому повторно запитуємо його при поверненні.
 * Якщо API недоступне — нічого не робить і не кидає помилок.
 */
interface WakeLockSentinelLike {
    release(): Promise<void>
}

interface WakeLockNavigator {
    wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> }
}

export async function keepScreenAwake(): Promise<() => Promise<void>> {
    const nav = (typeof navigator !== 'undefined' ? navigator : {}) as unknown as WakeLockNavigator
    if (!nav.wakeLock || typeof document === 'undefined') return async () => {}

    let sentinel: WakeLockSentinelLike | null = null
    let active = true

    const acquire = async () => {
        if (!active || document.visibilityState !== 'visible') return
        try {
            sentinel = await nav.wakeLock!.request('screen')
        } catch {
            // Користувач/система відмовили (економія заряду тощо) — просто працюємо без блокування екрана
        }
    }

    const onVisibilityChange = () => {
        if (document.visibilityState === 'visible') void acquire()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    await acquire()

    return async () => {
        active = false
        document.removeEventListener('visibilitychange', onVisibilityChange)
        try {
            await sentinel?.release()
        } catch {
            // вже знято системою
        }
        sentinel = null
    }
}
