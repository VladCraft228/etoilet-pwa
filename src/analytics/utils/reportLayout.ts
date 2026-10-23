/**
 * Спільний каркас HTML-звітів (доступність, оптимізація, ...),
 * щоб усі звіти мали однаковий вигляд: Tailwind, шапка, KPI-картки, футер.
 */

export type KpiColor = 'indigo' | 'emerald' | 'blue' | 'amber' | 'red'

// Повні назви класів (Tailwind CDN сканує DOM, але так надійніше й читабельніше)
const KPI_CLASSES: Record<KpiColor, { border: string; text: string; bar: string }> = {
    indigo: { border: 'border-indigo-500', text: 'text-indigo-600', bar: 'bg-indigo-500' },
    emerald: { border: 'border-emerald-500', text: 'text-emerald-600', bar: 'bg-emerald-500' },
    blue: { border: 'border-blue-500', text: 'text-blue-600', bar: 'bg-blue-500' },
    amber: { border: 'border-amber-500', text: 'text-amber-600', bar: 'bg-amber-500' },
    red: { border: 'border-red-500', text: 'text-red-600', bar: 'bg-red-500' },
}

export interface KpiCardOptions {
    label: string
    value: string
    color: KpiColor
    /** Підпис під значенням. */
    sub?: string
    /** Якщо задано — під значенням малюється прогрес-бар (0–100). */
    progressPercent?: number
    /** Підпис праворуч під прогрес-баром. */
    progressNote?: string
}

export function renderKpiCard(opts: KpiCardOptions): string {
    const c = KPI_CLASSES[opts.color]
    const progress =
        opts.progressPercent !== undefined
            ? `
                        <div class="w-full bg-slate-200 rounded-full h-1.5 mt-3">
                            <div class="${c.bar} h-1.5 rounded-full" style="width: ${Math.max(0, Math.min(100, opts.progressPercent))}%"></div>
                        </div>
                        ${opts.progressNote ? `<p class="mt-2 text-xs text-slate-400 text-right">${opts.progressNote}</p>` : ''}`
            : opts.sub
              ? `<p class="mt-2 text-sm text-slate-400">${opts.sub}</p>`
              : ''

    return `
                <div class="bg-white overflow-hidden shadow rounded-lg border-l-4 ${c.border}">
                    <div class="px-4 py-5 sm:p-6">
                        <dt class="text-sm font-medium text-slate-500 truncate uppercase tracking-wide">${opts.label}</dt>
                        <dd class="mt-1 text-3xl font-semibold ${c.text}">${opts.value}</dd>
                        ${progress}
                    </div>
                </div>`
}

export function renderKpiGrid(cardsHtml: string[]): string {
    return `
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">${cardsHtml.join('')}
            </div>`
}

export type SectionTone = 'slate' | 'emerald' | 'amber' | 'red'

const SECTION_TONES: Record<SectionTone, { card: string; head: string; title: string; badge: string }> = {
    slate: {
        card: 'border-slate-200',
        head: 'border-slate-200 bg-slate-50',
        title: 'text-slate-800 font-medium',
        badge: 'bg-slate-200 text-slate-600',
    },
    emerald: {
        card: 'border-emerald-200',
        head: 'border-emerald-100 bg-emerald-50',
        title: 'text-emerald-900 font-bold',
        badge: 'bg-emerald-200 text-emerald-800',
    },
    amber: {
        card: 'border-amber-200',
        head: 'border-amber-100 bg-amber-50',
        title: 'text-amber-900 font-bold',
        badge: 'bg-amber-200 text-amber-800',
    },
    red: {
        card: 'border-red-200',
        head: 'border-red-100 bg-red-50',
        title: 'text-red-900 font-bold',
        badge: 'bg-red-200 text-red-800',
    },
}

/** Картка-секція (біла, із кольоровою смугою-заголовком і бейджем справа). */
export function renderSection(opts: {
    title: string
    badge?: string
    bodyHtml: string
    tone?: SectionTone
}): string {
    const t = SECTION_TONES[opts.tone ?? 'slate']
    return `
            <div class="bg-white shadow-lg rounded-lg overflow-hidden border ${t.card} mb-8">
                <div class="px-6 py-4 border-b ${t.head} flex justify-between items-center">
                    <h2 class="text-lg ${t.title} flex items-center gap-2">${opts.title}</h2>
                    ${opts.badge ? `<span class="text-xs font-semibold px-2.5 py-1 ${t.badge} rounded-full">${opts.badge}</span>` : ''}
                </div>
                ${opts.bodyHtml}
            </div>`
}

export const TH_LEFT = 'px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider'
export const TH_RIGHT = 'px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider'
export const TH_CENTER = 'px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider'

export interface ReportPageOptions {
    /** <title> вкладки. */
    title: string
    /** Заголовок h1 (з емодзі). */
    heading: string
    /** Підзаголовок: «Звіт сформовано: …». */
    subtitleHtml: string
    bodyHtml: string
    /** Нижній блок «Легенда / Примітки». */
    footerHtml?: string
}

export function renderReportPage(opts: ReportPageOptions): string {
    return `<!DOCTYPE html>
<html lang="uk">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${opts.title}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .no-print { display: none; }
        }
    </style>
</head>
<body class="bg-slate-50 text-slate-800 font-sans antialiased">
    <div class="max-w-7xl mx-auto p-6 sm:p-10">
        <header class="mb-10 border-b border-slate-200 pb-6">
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 class="text-3xl font-bold text-slate-900 tracking-tight">${opts.heading}</h1>
                    <p class="text-slate-500 mt-2">${opts.subtitleHtml}</p>
                </div>
                <div class="flex items-center gap-3 no-print">
                    <button onclick="window.print()" class="inline-flex items-center px-4 py-2 bg-white border border-slate-300 rounded-md shadow-sm text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                        🖨️ Друк / PDF
                    </button>
                </div>
            </div>
        </header>
${opts.bodyHtml}
${opts.footerHtml ? `
        <footer class="mt-10 pt-6 border-t border-slate-200 text-sm text-slate-500">
${opts.footerHtml}
        </footer>` : ''}
    </div>
</body>
</html>`
}

/** Двоколонковий футер: «Легенда» + «Примітки». */
export function renderFooterColumns(legendHtml: string, notesHtml: string): string {
    return `            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                    <h3 class="font-semibold text-slate-700 mb-2">Легенда:</h3>
                    ${legendHtml}
                </div>
                <div>
                    <h3 class="font-semibold text-slate-700 mb-2">Примітки:</h3>
                    ${notesHtml}
                </div>
            </div>`
}

export function legendItem(dotClasses: string, text: string): string {
    return `<li class="flex items-center"><span class="w-3 h-3 rounded-full ${dotClasses} mr-2"></span> ${text}</li>`
}
