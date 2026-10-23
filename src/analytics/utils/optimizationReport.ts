import * as turf from '@turf/turf'
import type { Toilet } from '../../types'
import type { AccessibilitySummary } from './accessibility'
import type { OptimizationCandidate, OptimizationSummary } from '../types/optimizationType'
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
} from './reportLayout'

// ==========================================================
// ПІДГОТОВКА ДАНИХ
// ==========================================================

interface ReportRow {
    rank: number
    candidate: OptimizationCandidate
    distanceToNearestExistingM: number | null
    nearestExistingName: string
}

function toiletLabel(toilet: Toilet): string {
    if (toilet.address) return toilet.address
    return toilet.type === 'bio' ? 'Біотуалет' : 'Громадська вбиральня'
}

function buildRows(summary: OptimizationSummary, toilets: Toilet[]): ReportRow[] {
    const placed = toilets.filter((t) => t.latitude != null && t.longitude != null)

    return summary.topCandidates.map((candidate, idx) => {
        const point = turf.point([candidate.longitude, candidate.latitude])
        let best: { toilet: Toilet; dist: number } | null = null

        for (const toilet of placed) {
            const dist = turf.distance(point, turf.point([toilet.longitude!, toilet.latitude!]), { units: 'meters' })
            if (!best || dist < best.dist) best = { toilet, dist }
        }

        return {
            rank: idx + 1,
            candidate,
            distanceToNearestExistingM: best ? Math.round(best.dist) : null,
            nearestExistingName: best ? toiletLabel(best.toilet) : '—',
        }
    })
}

const fmtDelta = (v: number) => `${v > 0 ? '+' : ''}${Number(v.toFixed(1))}%`
const mapsLink = (c: OptimizationCandidate) =>
    `https://www.google.com/maps?q=${c.latitude.toFixed(6)},${c.longitude.toFixed(6)}`

// ==========================================================
// SVG-МАПА (без зовнішніх бібліотек, працює офлайн і при друку)
// ==========================================================

function buildMapSvg(
    rows: ReportRow[],
    toilets: Toilet[],
    accessibility: AccessibilitySummary | null | undefined
): string {
    const W = 760
    const H = 520
    const PAD = 28

    const controlResults = accessibility?.results ?? []

    // Межі = контрольні точки + кандидати (+ запас). Далекі вбиральні поза межами не малюємо.
    const lats: number[] = [
        ...rows.map((r) => r.candidate.latitude),
        ...controlResults.map((r) => r.point.latitude),
    ]
    const lngs: number[] = [
        ...rows.map((r) => r.candidate.longitude),
        ...controlResults.map((r) => r.point.longitude),
    ]
    if (lats.length === 0) return ''

    const minLat = Math.min(...lats) - 0.004
    const maxLat = Math.max(...lats) + 0.004
    const minLng = Math.min(...lngs) - 0.006
    const maxLng = Math.max(...lngs) + 0.006

    // Проєкція з поправкою на широту, щоб карта не була розтягнута по горизонталі
    const cosLat = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180)
    const spanX = (maxLng - minLng) * cosLat
    const spanY = maxLat - minLat
    const scale = Math.min((W - PAD * 2) / spanX, (H - PAD * 2) / spanY)
    const offsetX = (W - spanX * scale) / 2
    const offsetY = (H - spanY * scale) / 2

    const x = (lng: number) => offsetX + (lng - minLng) * cosLat * scale
    const y = (lat: number) => offsetY + (maxLat - lat) * scale
    const inside = (lat: number, lng: number) => lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng

    const parts: string[] = []

    // Існуючі вбиральні
    for (const t of toilets) {
        if (t.latitude == null || t.longitude == null || !inside(t.latitude, t.longitude)) continue
        const fill = t.type === 'bio' ? '#10b981' : '#2563eb'
        parts.push(`<circle cx="${x(t.longitude).toFixed(1)}" cy="${y(t.latitude).toFixed(1)}" r="3.2" fill="${fill}" fill-opacity="0.75" />`)
    }

    // Контрольні точки за зонами
    for (const r of controlResults) {
        const fill = !r.analyzed ? '#94a3b8' : r.isAccessible5Min ? '#22c55e' : r.isAccessible10Min ? '#eab308' : '#ef4444'
        parts.push(
            `<rect x="${(x(r.point.longitude) - 3.5).toFixed(1)}" y="${(y(r.point.latitude) - 3.5).toFixed(1)}" width="7" height="7" fill="${fill}" stroke="#fff" stroke-width="1" transform="rotate(45 ${x(r.point.longitude).toFixed(1)} ${y(r.point.latitude).toFixed(1)})"><title>${escapeHtml(r.point.name)}</title></rect>`
        )
    }

    // Кандидати ТОП-5
    for (const row of rows) {
        const cx = x(row.candidate.longitude).toFixed(1)
        const cy = y(row.candidate.latitude).toFixed(1)
        const fill = row.rank === 1 ? '#059669' : '#4f46e5'
        parts.push(
            `<circle cx="${cx}" cy="${cy}" r="11" fill="${fill}" stroke="#fff" stroke-width="2"/>` +
            `<text x="${cx}" y="${(Number(cy) + 4).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="700" fill="#fff">${row.rank}</text>`
        )
    }

    return `
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Схема розміщення кандидатів" class="w-full h-auto rounded border border-slate-200">
        <rect width="${W}" height="${H}" fill="#f8fafc" />
        ${parts.join('\n        ')}
    </svg>`
}

// ==========================================================
// HTML-ЗВІТ
// ==========================================================

function renderTopTable(rows: ReportRow[]): string {
    const body = rows
        .map((r) => {
            const rankBadge =
                r.rank === 1
                    ? '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 whitespace-nowrap">★ 1</span>'
                    : `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">${r.rank}</span>`

            return `
                            <tr class="hover:bg-gray-50 transition-colors duration-150">
                                <td class="px-6 py-4 whitespace-nowrap text-sm">${rankBadge}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-indigo-600 font-mono"><a href="${mapsLink(r.candidate)}" target="_blank" rel="noopener" class="hover:underline">${r.candidate.latitude.toFixed(5)}, ${r.candidate.longitude.toFixed(5)}</a></td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-emerald-600 font-semibold text-right font-mono">${fmtDelta(r.candidate.deltaCoverage5)}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-emerald-600 font-semibold text-right font-mono">${fmtDelta(r.candidate.deltaCoverage10)}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-mono">${Number(r.candidate.coverage5.toFixed(1))}% / ${Number(r.candidate.coverage10.toFixed(1))}%</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-right font-mono">${r.candidate.improvedPoints}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold text-right font-mono">${Math.round(r.candidate.avgWalkingDistance)}</td>
                                <td class="px-6 py-4 text-sm text-gray-600 text-right">
                                    <span class="font-mono">${r.distanceToNearestExistingM ?? '—'}</span>
                                    <div class="text-xs text-slate-400 max-w-[200px] ml-auto truncate" title="${escapeHtml(r.nearestExistingName)}">${escapeHtml(r.nearestExistingName)}</div>
                                </td>
                            </tr>`
        })
        .join('')

    return `
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-slate-200">
                        <thead class="bg-slate-100">
                            <tr>
                                <th scope="col" class="${TH_LEFT}">№</th>
                                <th scope="col" class="${TH_LEFT}">Координати</th>
                                <th scope="col" class="${TH_RIGHT}">Δ 5 хв</th>
                                <th scope="col" class="${TH_RIGHT}">Δ 10 хв</th>
                                <th scope="col" class="${TH_RIGHT}">Покриття 5 / 10 хв</th>
                                <th scope="col" class="${TH_RIGHT}">Покращено точок</th>
                                <th scope="col" class="${TH_RIGHT}">Сер. відстань (м)</th>
                                <th scope="col" class="${TH_RIGHT}">До найближчої наявної (м)</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-slate-200">${body}
                        </tbody>
                    </table>
                </div>
                ${rows.length === 0 ? '<div class="p-10 text-center text-slate-500">Немає кандидатів для відображення</div>' : ''}`
}

function renderParams(summary: OptimizationSummary): string {
    const params = summary.params
    if (!params) return ''

    const row = (label: string, value: string) => `
                        <div class="px-6 py-3 flex justify-between gap-6 text-sm">
                            <dt class="text-slate-500">${label}</dt>
                            <dd class="text-slate-800 font-medium text-right">${value}</dd>
                        </div>`

    return renderSection({
        title: 'Параметри симуляції',
        bodyHtml: `
                <dl class="divide-y divide-slate-100">${[
                    row('Сітка кандидатів', `крок ${params.gridStepDegrees}° (≈ ${Math.round(params.gridStepDegrees * 111320)} м по широті), ${summary.totalCandidates} вузлів`),
                    row('Територія', `${params.bounds.minLatitude}–${params.bounds.maxLatitude}° пн. ш., ${params.bounds.minLongitude}–${params.bounds.maxLongitude}° сх. д.`),
                    row('Оцінено через OSRM', `${summary.evaluatedCandidates ?? '—'} кандидатів`),
                    row('Фільтр води', `відхилення, якщо до пішохідної мережі &gt; ${params.maxSnapDistanceMeters} м`),
                    row('Мін. відстань до наявних', `${params.minDistanceToExistingMeters} м`),
                ].join('')}
                </dl>`,
    })
}

export function exportOptimizationReportHtml(
    summary: OptimizationSummary,
    toilets: Toilet[],
    accessibility?: AccessibilitySummary | null
): void {
    const rows = buildRows(summary, toilets)
    const generated = summary.generatedAt ? new Date(summary.generatedAt) : new Date()
    const dateStr = generated.toLocaleDateString('uk-UA')
    const timeStr = generated.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
    const best = rows[0]?.candidate

    const evaluated = summary.evaluatedCandidates
    const evaluatedPercent =
        evaluated !== undefined && summary.totalCandidates > 0
            ? Math.round((evaluated / summary.totalCandidates) * 100)
            : null

    const kpis = renderKpiGrid([
        renderKpiCard({
            label: 'Базове покриття 5 хв',
            value: `${Number(summary.baseline.coverage5.toFixed(1))}%`,
            color: 'indigo',
            sub: `10 хв: ${Number(summary.baseline.coverage10.toFixed(1))}%`,
        }),
        renderKpiCard({
            label: 'Сер. відстань ходу',
            value: `${Math.round(summary.baseline.avgWalkingDistance)} м`,
            color: 'emerald',
            sub: 'До найближчої вбиральні (до змін)',
        }),
        evaluatedPercent !== null
            ? renderKpiCard({
                  label: 'Оцінено кандидатів',
                  value: `${evaluated}`,
                  color: 'blue',
                  progressPercent: evaluatedPercent,
                  progressNote: `з ${summary.totalCandidates} вузлів сітки`,
              })
            : renderKpiCard({
                  label: 'Вузлів сітки',
                  value: `${summary.totalCandidates}`,
                  color: 'blue',
                  sub: 'Кандидатів на перевірку',
              }),
        renderKpiCard({
            label: 'Найкращий кандидат',
            value: best ? `${fmtDelta(best.deltaCoverage5)} / ${fmtDelta(best.deltaCoverage10)}` : '—',
            color: 'amber',
            sub: 'Приріст покриття 5 / 10 хв',
        }),
    ])

    const mapSvg = buildMapSvg(rows, toilets, accessibility)

    const legend = `<ul class="space-y-2">
                        ${legendItem('bg-emerald-600', 'Кандидат №1 (найкращий)')}
                        ${legendItem('bg-indigo-600', 'Кандидати 2–5')}
                        ${legendItem('bg-blue-600', 'Наявні громадські вбиральні')}
                        ${legendItem('bg-emerald-500', 'Наявні біотуалети')}
                        ${legendItem('bg-green-500', 'Контрольна точка ≤ 5 хв')}
                        ${legendItem('bg-yellow-500', 'Контрольна точка 5–10 хв')}
                        ${legendItem('bg-red-500', 'Контрольна точка &gt; 10 хв')}
                    </ul>`

    const onePointPercent = accessibility?.totalControlPoints
        ? Number((100 / accessibility.totalControlPoints).toFixed(1))
        : null

    const notes = `<p class="mb-2"><strong>Δ (дельта):</strong> різниця покриття відносно базового стану. ${onePointPercent !== null ? `Одна контрольна точка дає ≈ ${onePointPercent}% покриття, тому` : 'Тому'} кандидати з однаковою Δ розрізняються лише додатковими критеріями (Δ10, сер. відстань).</p>
                    <p class="mb-2"><strong>Покращено точок:</strong> кількість контрольних точок, для яких пішохідна відстань до найближчої вбиральні зменшилась.</p>
                    <p>Для кожного вузла сітки (після прив'язки до пішохідної мережі OSRM) додається віртуальна вбиральня й повторно рахується доступність усіх контрольних точок.</p>
                    <p class="mt-2 text-xs italic">* Результат залежить від набору контрольних точок і якості пішохідного графа OSM; перед встановленням перевірте місце на місцевості.</p>`

    const html = renderReportPage({
        title: 'Звіт оптимізації розміщення вбиральень',
        heading: '📍 Оптимізація розміщення міських вбиральень',
        subtitleHtml: `Звіт сформовано: <span class="font-medium text-slate-700">${dateStr}, ${timeStr}</span> · симуляція «що, якщо» для однієї нової вбиральні`,
        bodyHtml:
            kpis +
            renderSection({
                title: `ТОП-${rows.length} місць для нової вбиральні`,
                badge: `Кандидатів: ${summary.totalCandidates}`,
                bodyHtml: renderTopTable(rows),
            }) +
            (mapSvg
                ? renderSection({
                      title: 'Схема розміщення',
                      bodyHtml: `<div class="p-4">${mapSvg}</div>`,
                  })
                : '') +
            renderParams(summary),
        footerHtml: renderFooterColumns(legend, notes),
    })

    downloadFile(html, `optimization_report_${new Date().toISOString().slice(0, 10)}.html`, 'text/html;charset=utf-8;')
}

// ==========================================================
// CSV
// ==========================================================

export function exportOptimizationReportCsv(summary: OptimizationSummary, toilets: Toilet[]): void {
    const rows = buildRows(summary, toilets)
    const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`

    let csv = '﻿'
    csv += [
        '№', 'Широта', 'Довгота', 'Δ покриття 5 хв (%)', 'Δ покриття 10 хв (%)',
        'Покриття 5 хв (%)', 'Покриття 10 хв (%)', 'Покращено точок',
        'Сер. відстань ходу (м)', 'Сер. час ходу (хв)', 'Сер. CF',
        'До найближчої наявної (м)', 'Найближча наявна', 'Посилання',
    ].join(';') + '\n'

    for (const r of rows) {
        const c = r.candidate
        csv += [
            r.rank, c.latitude, c.longitude, c.deltaCoverage5, c.deltaCoverage10,
            c.coverage5, c.coverage10, c.improvedPoints,
            Math.round(c.avgWalkingDistance), c.avgWalkingTime, c.avgCircuity,
            r.distanceToNearestExistingM ?? '', q(r.nearestExistingName), mapsLink(c),
        ].join(';') + '\n'
    }

    csv += '\nПАРАМЕТРИ;\n'
    csv += `Базове покриття 5 хв;${summary.baseline.coverage5}%\n`
    csv += `Базове покриття 10 хв;${summary.baseline.coverage10}%\n`
    csv += `Базова сер. відстань;${Math.round(summary.baseline.avgWalkingDistance)} м\n`
    csv += `Вузлів сітки;${summary.totalCandidates}\n`
    csv += `Оцінено через OSRM;${summary.evaluatedCandidates ?? ''}\n`
    if (summary.params) {
        csv += `Крок сітки;${summary.params.gridStepDegrees}\n`
        csv += `Макс. відстань до мережі (м);${summary.params.maxSnapDistanceMeters}\n`
        csv += `Мін. відстань до наявних (м);${summary.params.minDistanceToExistingMeters}\n`
    }

    downloadFile(csv, `optimization_report_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8;')
}
