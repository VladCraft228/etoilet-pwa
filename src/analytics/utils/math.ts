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