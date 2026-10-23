import type { Toilet } from '../../types'
import type { ControlPoint } from '../data/controlPoints'
import type { AccessibilitySummary, ControlPointAnalysisResult } from './accessibility'
import { calculateCategoryAccessibilityStats } from './categoryStats'
import { downloadFile, escapeHtml } from './download'
import {
    TH_LEFT,
    TH_RIGHT,
    legendItem,
    renderFooterColumns,
    renderKpiCard,
    renderKpiGrid,
    renderReportPage,
    renderSection,
    type SectionTone,
} from './reportLayout'

// ==========================================================
// ПІДПИСИ
// ==========================================================

const CATEGORY_LABELS: Record<ControlPoint['category'], string> = {
    park: 'Парк',
    embankment: 'Набережна',
    transport: 'Транспорт',
    pedestrian: 'Пішохідна зона',
    shopping: 'ТРЦ / торгівля',
}

const categoryLabel = (c: ControlPoint['category']) => CATEGORY_LABELS[c] ?? c

/** Читабельна назва вбиральні: адреса або «Тип · короткий id». */
function toiletLabel(toilet: Toilet): string {
    if (toilet.address) return toilet.address
    const kind = toilet.type === 'bio' ? 'Біотуалет' : 'Громадська вбиральня'
    return `${kind} · ${String(toilet.id).slice(0, 8)}`
}

// ==========================================================
// CSV
// ==========================================================

export function exportAccessibilityResultsCsv(
    summary: AccessibilitySummary,
    maxCandidates: number = 3
) {
    let csv = '\uFEFF'

    csv += [
        'ID', 'Назва', 'Категорія', 'Широта', 'Довгота',
        'Найближча вбиральня', 'Евклідова відстань (м)',
        'Пішохідна відстань (м)', 'Час (с)', 'Час (хв)',
        'Circuity Factor', 'Доступно 5 хв', 'Доступно 10 хв', 'Статус'
    ].join(';') + '\n'

    for (const result of summary.results) {
        const point = result.point
        const toiletName = result.nearestToilet ? toiletLabel(result.nearestToilet) : 'N/A'
        const walkingTimeMin = (result.walkingDurationSeconds / 60).toFixed(1)

        const safeName = `"${point.name.replace(/"/g, '""')}"`
        const safeToilet = `"${String(toiletName).replace(/"/g, '""')}"`

        csv += [
            point.id,
            safeName,
            point.category,
            point.latitude,
            point.longitude,
            safeToilet,
            result.straightDistanceMeters,
            result.walkingDistanceMeters,
            result.walkingDurationSeconds,
            walkingTimeMin,
            result.circuityFactor,
            result.isAccessible5Min ? 'Так' : 'Ні',
            result.isAccessible10Min ? 'Так' : 'Ні',
            result.analyzed ? 'OK' : 'FAIL'
        ].join(';') + '\n'
    }

    csv += '\n'
    csv += `ПАРАМЕТРИ АНАЛІЗУ;\n`
    csv += `MAX_CANDIDATES;${maxCandidates}\n`
    csv += `Всього точок;${summary.totalControlPoints}\n`
    csv += `Успішно проаналізовано;${summary.analyzedControlPoints}\n`
    csv += `Помилки;${summary.failedControlPoints}\n`
    csv += `Покриття 5 хв;${summary.accessible5MinPercent}%\n`
    csv += `Покриття 10 хв;${summary.accessible10MinPercent}%\n`
    csv += `Середній час ходу;${summary.avgWalkingTimeMins} хв\n`
    csv += `Медіанний час ходу;${summary.medianWalkingTimeMins} хв\n`

    downloadFile(csv, `accessibility_report_${new Date().toISOString().slice(0,10)}.csv`, 'text/csv;charset=utf-8;')
}

// ==========================================================
// HTML
// ==========================================================

type Zone = 'comfort' | 'acceptable' | 'critical' | 'failed'

function getZone(r: ControlPointAnalysisResult): Zone {
    if (!r.analyzed) return 'failed'
    if (r.isAccessible5Min) return 'comfort'
    if (r.isAccessible10Min) return 'acceptable'
    return 'critical'
}

const ZONES: Array<{ key: Zone; emoji: string; title: string; tone: SectionTone }> = [
    { key: 'comfort', emoji: '🟢', title: 'Зона комфорту (≤ 5 хвилин / до 400 м)', tone: 'emerald' },
    { key: 'acceptable', emoji: '🟡', title: 'Допустима зона (5–10 хвилин / 400–800 м)', tone: 'amber' },
    { key: 'critical', emoji: '🔴', title: 'Зона критичного дефіциту (> 10 хвилин / понад 800 м)', tone: 'red' },
    { key: 'failed', emoji: '⚪', title: 'Не вдалося розрахувати', tone: 'slate' },
]

const TD = 'px-4 py-3 whitespace-nowrap text-sm'

function renderZoneRows(rows: ControlPointAnalysisResult[]): string {
    return rows
        .map((r) => {
            const name = escapeHtml(r.point.name)
            const toilet = r.nearestToilet ? escapeHtml(toiletLabel(r.nearestToilet)) : '—'

            return `
                            <tr class="hover:bg-gray-50 transition-colors duration-150">
                                <td class="${TD} font-medium text-gray-900">${escapeHtml(r.point.id)}</td>
                                <td class="${TD} text-gray-700 max-w-xs truncate" title="${name}">${name}</td>
                                <td class="${TD} text-gray-600">${escapeHtml(categoryLabel(r.point.category))}</td>
                                <td class="${TD} text-gray-600 max-w-xs truncate" title="${toilet}">${toilet}</td>
                                <td class="${TD} text-gray-600 text-right font-mono">${r.straightDistanceMeters}</td>
                                <td class="${TD} text-gray-900 font-semibold text-right font-mono">${r.walkingDistanceMeters}</td>
                                <td class="${TD} text-gray-900 text-right font-mono">${(r.walkingDurationSeconds / 60).toFixed(1)}</td>
                                <td class="${TD} text-gray-600 text-right font-mono">${r.circuityFactor.toFixed(2)}</td>
                            </tr>`
        })
        .join('')
}

function renderZoneTable(rows: ControlPointAnalysisResult[]): string {
    return `
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-slate-200">
                        <thead class="bg-slate-50">
                            <tr>
                                <th scope="col" class="${TH_LEFT}">ID</th>
                                <th scope="col" class="${TH_LEFT}">Локація</th>
                                <th scope="col" class="${TH_LEFT}">Категорія</th>
                                <th scope="col" class="${TH_LEFT}">Найближча вбиральня</th>
                                <th scope="col" class="${TH_RIGHT}">Пряма (м)</th>
                                <th scope="col" class="${TH_RIGHT}">Маршрут (м)</th>
                                <th scope="col" class="${TH_RIGHT}">Час (хв)</th>
                                <th scope="col" class="${TH_RIGHT}">CF</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-200 bg-white">${renderZoneRows(rows)}
                        </tbody>
                    </table>
                </div>`
}

function renderCategorySection(summary: AccessibilitySummary): string {
    const stats = calculateCategoryAccessibilityStats(summary.results)
    if (stats.length === 0) return ''

    const pct = (v: number) => `${Math.round(v)}%`
    const rows = stats
        .sort((a, b) => a.coverage5 - b.coverage5)
        .map(
            (s) => `
                            <tr class="hover:bg-gray-50 transition-colors duration-150">
                                <td class="${TD} font-medium text-gray-900">${escapeHtml(categoryLabel(s.category))}</td>
                                <td class="${TD} text-gray-600 text-right font-mono">${s.count}</td>
                                <td class="${TD} text-gray-900 text-right font-mono">${pct(s.coverage5)}</td>
                                <td class="${TD} text-gray-900 text-right font-mono">${pct(s.coverage10)}</td>
                                <td class="${TD} text-gray-600 text-right font-mono">${(s.avgTime / 60).toFixed(1)}</td>
                                <td class="${TD} text-gray-600 text-right font-mono">${(s.medianTime / 60).toFixed(1)}</td>
                                <td class="${TD} text-gray-600 text-right font-mono">${s.avgCircuity.toFixed(2)}</td>
                            </tr>`
        )
        .join('')

    return renderSection({
        title: 'Покриття за категоріями',
        badge: `${stats.length} категорій`,
        bodyHtml: `
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-slate-200">
                        <thead class="bg-slate-50">
                            <tr>
                                <th scope="col" class="${TH_LEFT}">Категорія</th>
                                <th scope="col" class="${TH_RIGHT}">Точок</th>
                                <th scope="col" class="${TH_RIGHT}">5 хв</th>
                                <th scope="col" class="${TH_RIGHT}">10 хв</th>
                                <th scope="col" class="${TH_RIGHT}">Сер. час (хв)</th>
                                <th scope="col" class="${TH_RIGHT}">Медіана (хв)</th>
                                <th scope="col" class="${TH_RIGHT}">Сер. CF</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-200 bg-white">${rows}
                        </tbody>
                    </table>
                </div>`,
    })
}

export function exportAccessibilityReportHtml(
    summary: AccessibilitySummary,
    maxCandidates: number = 3
): void {
    const dateStr = new Date().toLocaleDateString('uk-UA')

    const successRate =
        summary.totalControlPoints > 0
            ? Math.round((summary.analyzedControlPoints / summary.totalControlPoints) * 100)
            : 0

    const kpis = renderKpiGrid([
        renderKpiCard({
            label: 'Покриття 5 хв',
            value: `${summary.accessible5MinPercent}%`,
            color: 'indigo',
            sub: `${summary.accessible5MinCount} з ${summary.totalControlPoints} точок · 10 хв: ${summary.accessible10MinPercent}%`,
        }),
        renderKpiCard({
            label: 'Середній час ходу',
            value: `${summary.avgWalkingTimeMins} хв`,
            color: 'emerald',
            sub: `Медіана: ${summary.medianWalkingTimeMins} хв`,
        }),
        renderKpiCard({
            label: 'Успішність розрахунку',
            value: `${successRate}%`,
            color: 'blue',
            progressPercent: successRate,
            progressNote: `${summary.failedControlPoints} помилок`,
        }),
        renderKpiCard({
            label: 'Circuity Factor',
            value: `${summary.avgCircuityFactor}`,
            color: 'amber',
            sub: 'Середнє відхилення маршруту',
        }),
    ])

    // Всередині зони: від найгіршого часу до найкращого — найпроблемніші точки зверху
    const zoneSections = ZONES.map((zone) => {
        const rows = summary.results
            .filter((r) => getZone(r) === zone.key)
            .sort((a, b) => b.walkingDurationSeconds - a.walkingDurationSeconds)

        if (rows.length === 0 && zone.key === 'failed') return ''

        return renderSection({
            title: `<span>${zone.emoji}</span> ${zone.title}`,
            badge: `${rows.length} ${pluralPoints(rows.length)}`,
            tone: zone.tone,
            bodyHtml:
                rows.length > 0
                    ? renderZoneTable(rows)
                    : '<div class="p-6 text-center text-sm text-slate-500">Немає точок у цій зоні</div>',
        })
    }).join('')

    const legend = `<ul class="space-y-2">
                        ${legendItem('bg-emerald-200 border border-emerald-300', 'Зона комфорту (≤ 5 хв / до 400 м)')}
                        ${legendItem('bg-amber-200 border border-amber-300', 'Допустима зона (5–10 хв / 400–800 м)')}
                        ${legendItem('bg-red-200 border border-red-300', 'Зона критичного дефіциту (&gt; 10 хв / понад 800 м)')}
                    </ul>`

    const notes = `<p class="mb-2"><strong>CF (Circuity Factor):</strong> Відношення довжини пішохідного маршруту до прямої відстані. Чим ближче до 1.0, тим пряміший шлях.</p>
                    <p>Маршрутизація виконана через OSRM (профіль пішохода); розглянуто ${maxCandidates} найближчих вбиральні для кожної точки. У межах зони точки відсортовано від найдовшого часу ходу.</p>
                    <p class="mt-2 text-xs italic">* Для точок у межах прямої видимості (≤ 180 м) чи де OSRM не зміг прокласти маршрут (парки, набережні), використано евклідову відстань або оцінку з коефіцієнтом обходу.</p>`

    const html = renderReportPage({
        title: 'Звіт доступності вбиральень',
        heading: '🚽 Аналіз доступності міських вбиральень',
        subtitleHtml: `Звіт сформовано: <span class="font-medium text-slate-700">${dateStr}</span>`,
        bodyHtml: kpis + renderCategorySection(summary) + zoneSections,
        footerHtml: renderFooterColumns(legend, notes),
    })

    downloadFile(html, `accessibility_report_${new Date().toISOString().slice(0, 10)}.html`, 'text/html;charset=utf-8;')
}

function pluralPoints(n: number): string {
    const mod10 = n % 10
    const mod100 = n % 100
    if (mod10 === 1 && mod100 !== 11) return 'точка'
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'точки'
    return 'точок'
}
