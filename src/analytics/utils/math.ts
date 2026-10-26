export function average(values: number[]): number {
    if (values.length === 0) return 0
    const finiteValues = values.filter(v => typeof v === 'number' && isFinite(v))
    if (finiteValues.length === 0) return 0
    return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length
}

export function median(values: number[]): number {
    if (values.length === 0) return 0
    const sorted = [...values].filter(v => typeof v === 'number' && isFinite(v)).sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle]
}

/** Перцентиль з лінійною інтерполяцією (p у діапазоні 0–100). */
export function percentile(values: number[], p: number): number {
    const sorted = values.filter((v) => typeof v === 'number' && isFinite(v)).sort((a, b) => a - b)
    if (sorted.length === 0) return 0
    const idx = (Math.min(100, Math.max(0, p)) / 100) * (sorted.length - 1)
    const lo = Math.floor(idx)
    const hi = Math.ceil(idx)
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}
