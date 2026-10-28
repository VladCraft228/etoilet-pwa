import * as turf from '@turf/turf'
import type { Toilet } from '../../types'
import type { AccessibilitySummary } from './accessibility'
import type { OptimizationCandidate, OptimizationSummary } from '../types/optimizationType'
import { categoryLabel } from './accessibilityReport'
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
const coord = (v: number) => Number(v.toFixed(5))

const STOP_REASON_LABELS: Record<NonNullable<OptimizationSummary['stopReason']>, string> = {
    'target-reached': 'досягнуто ціль покриття за 5 хв',
    'no-gain': 'подальші кандидати не дають приросту покриття за 5 хв',
    'max-steps': 'досягнуто ліміт кроків',
    'no-candidates': 'не залишилось придатних кандидатів',
}

/** Δ у точках (точно) та у в. п. (без накопичення помилки округлення відсотків). */
function fmtDeltaPoints(count: number | undefined, n: number, roundedPercent: number): string {
    if (count === undefined || n <= 0) return fmtDelta(roundedPercent)
    const pct = Number(((count / n) * 100).toFixed(1))
    return `${count > 0 ? '+' : ''}${count}т.(${count > 0 ? '+' : ''}${pct}%)`
}
const mapsLink = (c: OptimizationCandidate) =>
    `https://www.google.com/maps?q=${c.latitude.toFixed(6)},${c.longitude.toFixed(6)}`

const localFilenameDate = () => new Date().toLocaleDateString('sv-SE')

function getAnalysisMode(summary: OptimizationSummary): { label: string; filename: string } {
    return summary.params?.mode === 'per-category'
        ? { label: 'Кожна категорія', filename: 'per-category' }
        : { label: 'Загальне покриття', filename: 'overall' }
}

// ==========================================================
// SVG-СХЕМА (запасний варіант без зовнішніх бібліотек, працює офлайн)
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

    // Обрані кроки оптимізації
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
// ІНТЕРАКТИВНА МАПА (MapLibre + OpenFreeMap, як на головній) із SVG-запасним варіантом
// ==========================================================

// Той самий стиль і бібліотека, що й на головній мапі застосунку (useMap.ts).
const MAPLIBRE_VERSION = '5.24.0'
const MAPLIBRE_CSS_SRI = 'sha256-qx5w1Z7EBGW65+cDDaLzzPKBM/1QLmK9WY7vut/XpzI='
const MAPLIBRE_JS_SRI = 'sha256-RamwepGJzlYFTGIKlHzPQeKR5YyV6bYVM7dAqqZe5cs='
const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/bright'

interface MapPayload {
    candidates: Array<{ rank: number; lat: number; lng: number; d5: string; d10: string }>
    toilets: Array<{ lat: number; lng: number; bio: boolean }>
    controlPoints: Array<{ lat: number; lng: number; name: string; zone: 'ok' | 'mid' | 'bad' | 'na' }>
}

function buildMapPayload(
    rows: ReportRow[],
    toilets: Toilet[],
    accessibility: AccessibilitySummary | null | undefined
): MapPayload {
    const controlResults = accessibility?.results ?? []

    const lats = [...rows.map((r) => r.candidate.latitude), ...controlResults.map((r) => r.point.latitude)]
    const lngs = [...rows.map((r) => r.candidate.longitude), ...controlResults.map((r) => r.point.longitude)]
    const minLat = Math.min(...lats) - 0.01
    const maxLat = Math.max(...lats) + 0.01
    const minLng = Math.min(...lngs) - 0.015
    const maxLng = Math.max(...lngs) + 0.015

    return {
        candidates: rows.map((r) => ({
            rank: r.rank,
            lat: r.candidate.latitude,
            lng: r.candidate.longitude,
            d5: fmtDeltaPoints(r.candidate.deltaCount5, r.candidate.n, r.candidate.deltaCoverage5),
            d10: fmtDeltaPoints(r.candidate.deltaCount10, r.candidate.n, r.candidate.deltaCoverage10),
        })),
        toilets: toilets
            .filter(
                (t) =>
                    t.latitude != null &&
                    t.longitude != null &&
                    t.latitude >= minLat &&
                    t.latitude <= maxLat &&
                    t.longitude >= minLng &&
                    t.longitude <= maxLng
            )
            .map((t) => ({ lat: t.latitude!, lng: t.longitude!, bio: t.type === 'bio' })),
        controlPoints: controlResults.map((r) => ({
            lat: r.point.latitude,
            lng: r.point.longitude,
            name: r.point.name,
            zone: !r.analyzed ? 'na' : r.isAccessible5Min ? 'ok' : r.isAccessible10Min ? 'mid' : 'bad',
        })),
    }
}

/**
 * Інтерактивна карта Дніпра з маркерами. Якщо MapLibre, WebGL або стиль недоступні
 * (офлайн), залишається статична SVG-схема.
 */
function buildMapBlock(
    rows: ReportRow[],
    toilets: Toilet[],
    accessibility: AccessibilitySummary | null | undefined
): string {
    const svg = buildMapSvg(rows, toilets, accessibility)
    if (!svg) return ''

    // `<` екрануємо, щоб назва точки не могла закрити <script>
    const payload = JSON.stringify(buildMapPayload(rows, toilets, accessibility)).replace(/</g, '\\u003c')

    return `
                <div class="p-4">
                    <div id="opt-map" class="hidden w-full rounded border border-slate-200" style="height: 560px;"></div>
                    <div id="opt-map-fallback">
                        ${svg}
                        <p class="mt-2 text-xs text-slate-400 text-center">Інтерактивну мапу не завантажено (потрібен інтернет) — показано спрощену схему.</p>
                    </div>
                </div>
                <link rel="stylesheet" href="https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css" integrity="${MAPLIBRE_CSS_SRI}" crossorigin="">
                <script src="https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.js" integrity="${MAPLIBRE_JS_SRI}" crossorigin=""></script>
                <script>
                (function () {
                    if (!window.maplibregl) return;
                    var data = ${payload};
                    var mapEl = document.getElementById('opt-map');
                    var fallbackEl = document.getElementById('opt-map-fallback');

                    var showFallback = function () {
                        mapEl.classList.add('hidden');
                        fallbackEl.style.display = '';
                    };

                    var map;
                    try {
                        mapEl.classList.remove('hidden');
                        fallbackEl.style.display = 'none';
                        map = new maplibregl.Map({
                            container: mapEl,
                            style: '${MAP_STYLE_URL}',
                            center: [35.0462, 48.4647],
                            zoom: 11,
                            maxZoom: 19,
                            cooperativeGestures: true,
                            attributionControl: { compact: true }
                        });
                    } catch (e) {
                        showFallback();
                        return;
                    }

                    // Стиль не завантажився (офлайн / немає WebGL) — повертаємо SVG-схему
                    var styleLoaded = false;
                    map.on('load', function () { styleLoaded = true; map.resize(); });
                    map.on('error', function () { if (!styleLoaded) showFallback(); });

                    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
                    map.scrollZoom.enable();   
                    map.touchZoomRotate.enable();

                    var zoneColor = { ok: '#22c55e', mid: '#eab308', bad: '#ef4444', na: '#94a3b8' };
                    var bounds = new maplibregl.LngLatBounds();

                    var addMarker = function (el, lng, lat, title) {
                        if (title) el.title = title;
                        new maplibregl.Marker({ element: el })
                            .setLngLat([lng, lat])
                            .setPopup(title ? new maplibregl.Popup({ offset: 14, closeButton: false }).setText(title) : undefined)
                            .addTo(map);
                    };

                    data.toilets.forEach(function (t) {
                        var el = document.createElement('div');
                        el.style.cssText = 'width:12px;height:12px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 3px rgba(0,0,0,.5);background:' +
                            (t.bio ? '#10b981' : '#2563eb');
                        addMarker(el, t.lng, t.lat, t.bio ? 'Біотуалет' : 'Громадська вбиральня');
                    });

                    data.controlPoints.forEach(function (c) {
                        // MapLibre сам задає transform маркера, тому ромб повертаємо у вкладеному елементі
                        var el = document.createElement('div');
                        el.style.cssText = 'width:14px;height:14px;';
                        var diamond = document.createElement('div');
                        diamond.style.cssText = 'width:12px;height:12px;margin:1px;border:1.5px solid #fff;box-shadow:0 0 3px rgba(0,0,0,.5);transform:rotate(45deg);background:' +
                            zoneColor[c.zone];
                        el.appendChild(diamond);
                        addMarker(el, c.lng, c.lat, c.name);
                        bounds.extend([c.lng, c.lat]);
                    });

                    data.candidates.forEach(function (c) {
                        var el = document.createElement('div');
                        el.textContent = c.rank;
                        el.style.cssText = 'width:30px;height:30px;border-radius:50%;border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.5);color:#fff;font:700 14px/24px system-ui,sans-serif;text-align:center;z-index:10;background:' +
                            (c.rank === 1 ? '#059669' : '#4f46e5');
                        addMarker(el, c.lng, c.lat, '№' + c.rank + ' · Δ5 ' + c.d5 + ' · Δ10 ' + c.d10);
                        bounds.extend([c.lng, c.lat]);
                    });

                    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 50, maxZoom: 15, duration: 0 });
                })();
                </script>`
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
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-emerald-600 font-semibold text-right font-mono">${fmtDeltaPoints(r.candidate.deltaCount5, r.candidate.n, r.candidate.deltaCoverage5)}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-emerald-600 font-semibold text-right font-mono">${fmtDeltaPoints(r.candidate.deltaCount10, r.candidate.n, r.candidate.deltaCoverage10)}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-mono">${Number(r.candidate.coverage5.toFixed(1))}% / ${Number(r.candidate.coverage10.toFixed(1))}%</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-emerald-700 text-right font-mono">${(r.candidate.deltaWalkingDistance ?? 0) >= 0 ? '+' : ''}${Math.round(r.candidate.deltaWalkingDistance ?? 0)}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-right font-mono">${r.candidate.improvedPoints}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold text-right font-mono">${Math.round(r.candidate.avgWalkingDistance)}</td>
                                <td class="px-6 py-4 text-sm text-gray-600 text-right">
                                    <span class="font-mono">${r.distanceToNearestExistingM ?? '—'}</span>
                                    <div class="text-xs text-slate-400 max-w-50 ml-auto truncate" title="${escapeHtml(r.nearestExistingName)}">${escapeHtml(r.nearestExistingName)}</div>
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
                                <th scope="col" class="${TH_RIGHT}">Δ сер. відстані (м)</th>
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

function renderCategoryImpact(summary: OptimizationSummary): string {
    const impact = summary.categoryImpact
    if (!impact || impact.length === 0) return ''

    const cell = (count: number, n: number) => `${count}/${n} (${n > 0 ? Math.round((count / n) * 100) : 0}%)`
    const delta = (a: number, b: number) => {
        const d = b - a
        return `<span class="${d > 0 ? 'text-emerald-600 font-semibold' : 'text-slate-400'}">${d > 0 ? '+' : ''}${d}т.</span>`
    }
    const TDC = 'px-6 py-3 whitespace-nowrap text-sm text-right font-mono'

    const rows = impact
        .slice()
        .sort((a, b) => a.before5 / a.n - b.before5 / b.n)
        .map(
            (c) => `
                            <tr class="hover:bg-gray-50 transition-colors duration-150">
                                <td class="px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-900">${escapeHtml(categoryLabel(c.category))}</td>
                                <td class="${TDC} text-gray-600">${c.n}</td>
                                <td class="${TDC} text-gray-600">${cell(c.before5, c.n)}</td>
                                <td class="${TDC} text-gray-900 font-semibold">${cell(c.after5, c.n)}</td>
                                <td class="${TDC}">${delta(c.before5, c.after5)}</td>
                                <td class="${TDC} text-gray-600">${cell(c.before10, c.n)}</td>
                                <td class="${TDC} text-gray-900 font-semibold">${cell(c.after10, c.n)}</td>
                                <td class="${TDC}">${delta(c.before10, c.after10)}</td>
                            </tr>`
        )
        .join('')

    return renderSection({
        title: 'Вплив на покриття за категоріями',
        badge: `${impact.length} категорій`,
        bodyHtml: `
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-slate-200">
                        <thead class="bg-slate-50">
                            <tr>
                                <th scope="col" class="${TH_LEFT}">Категорія</th>
                                <th scope="col" class="${TH_RIGHT}">n</th>
                                <th scope="col" class="${TH_RIGHT}">5 хв до</th>
                                <th scope="col" class="${TH_RIGHT}">5 хв після</th>
                                <th scope="col" class="${TH_RIGHT}">Δ</th>
                                <th scope="col" class="${TH_RIGHT}">10 хв до</th>
                                <th scope="col" class="${TH_RIGHT}">10 хв після</th>
                                <th scope="col" class="${TH_RIGHT}">Δ</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-200 bg-white">${rows}
                        </tbody>
                    </table>
                </div>`,
    })
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
            row('Кандидати', `груба сітка (крок ${params.gridStepDegrees}° ≈ ${Math.round(params.gridStepDegrees * 111320)} м)${params.deficitRingRadiiMeters ? ` + кільця ${params.deficitRingRadiiMeters.join(' / ')} м навколо точок, що досі &gt; 5 хв` : ''}; усього ${summary.totalCandidates} вузлів`),
            row('Територія', `${coord(params.bounds.minLatitude)}–${coord(params.bounds.maxLatitude)}° пн. ш., ${coord(params.bounds.minLongitude)}–${coord(params.bounds.maxLongitude)}° сх. д.`),
            row('Оцінено через OSRM', `${summary.evaluatedCandidates ?? '—'} кандидатів`),
            row('Фільтр води', `відхилення, якщо до пішохідної мережі &gt; ${params.maxSnapDistanceMeters} м`),
            row('Мін. відстань до наявних', `${params.minDistanceToExistingMeters} м`),
            ...(params.minCandidateSeparationMeters != null ? [row('Мін. відстань між обраними кандидатами', `${params.minCandidateSeparationMeters} м`)] : []),
            ...(params.targetCoverage5Percent != null ? [row('Ціль покриття за 5 хв', `${params.targetCoverage5Percent}%`)] : []),
            ...(params.minCoverageGainPercent != null ? [row('Мін. приріст покриття за 5 хв', `${params.minCoverageGainPercent} в. п. на крок`)] : []),
            ...(params.mode ? [row('Режим', params.mode === 'per-category' ? 'кожна категорія ≥ ' + (params.targetCoverage5Percent ?? 80) + '% за 5 хв' : 'загальне покриття ≥ ' + (params.targetCoverage5Percent ?? 80) + '% за 5 хв')] : []),
            ...(params.maxSteps != null ? [row('Макс. кроків', `${params.maxSteps}`)] : []),
            ...(summary.stopReason ? [row('Причина зупинки', STOP_REASON_LABELS[summary.stopReason])] : []),
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
    const last = rows[rows.length - 1]?.candidate
    const target = summary.params?.targetCoverage5Percent

    const evaluated = summary.evaluatedCandidates
    const evaluatedPercent =
        evaluated !== undefined && summary.totalCandidates > 0
            ? Math.round((evaluated / summary.totalCandidates) * 100)
            : null

    const perCategory = summary.params?.mode === 'per-category'
    const { label: analysisLabel, filename: modeFilename } = getAnalysisMode(summary)
    const categoriesReached = (summary.categoryImpact ?? []).every(
        (c) => c.n === 0 || (c.after5 / c.n) * 100 >= (target ?? 80)
    )
    const goalText =
        target == null
            ? ''
            : perCategory
              ? ` · ціль ${target}% у кожній категорії ${categoriesReached ? 'досягнуто' : 'не досягнуто'}`
              : ` · ціль ${target}% ${last && last.coverage5 >= target ? 'досягнуто' : 'не досягнуто'}`

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
                progressNote: `з ${summary.totalCandidates} кандидатних вузлів`,
            })
            : renderKpiCard({
                label: 'Кандидатних вузлів',
                value: `${summary.totalCandidates}`,
                color: 'blue',
                sub: 'Кандидатів на перевірку',
            }),
        renderKpiCard({
            label: 'Підсумок симуляції',
            value: last
                ? `${Number(summary.baseline.coverage5.toFixed(1))}% → ${Number(last.coverage5.toFixed(1))}%`
                : 'без змін',
            color: 'amber',
            sub: last
                ? `Покриття 5 хв після ${rows.length} ${rows.length === 1 ? 'вбиральні' : 'вбиралень'}; 10 хв: ${Number(last.coverage10.toFixed(1))}%${goalText}`
                : 'Жоден кандидат не дає суттєвого приросту',
        }),
    ])

    const mapBlock = buildMapBlock(rows, toilets, accessibility)

    const legend = `<ul class="space-y-2">
                        ${legendItem('bg-emerald-600', 'Крок №1 (перша додана вбиральня)')}
                        ${legendItem('bg-indigo-600', 'Кроки №2 і далі')}
                        ${legendItem('bg-blue-600', 'Наявні громадські вбиральні')}
                        ${legendItem('bg-emerald-500', 'Наявні біотуалети')}
                        ${legendItem('bg-green-500', 'Контрольна точка ≤ 5 хв')}
                        ${legendItem('bg-yellow-500', 'Контрольна точка 5–10 хв')}
                        ${legendItem('bg-red-500', 'Контрольна точка &gt; 10 хв')}
                    </ul>`

    const notes = `<p class="mb-2"><strong>Δ (дельта):</strong> зміна метрик відносно baseline на поточному кроці. На кожному кроці кандидати ранжуються лексикографічно за ΔC5, ΔC10 і Δd (зменшення середньої відстані).</p>
                    <p class="mb-2"><strong>Покращено точок:</strong> кількість контрольних точок, для яких пішохідна відстань до найближчої вбиральні зменшилась.</p>
                    <p>Послідовно обирається найкращий кандидат, додається до моделі як вбиральня та перераховується baseline. Кандидати — груба сітка плюс кільця навколо контрольних точок, що ще далі за 5 хв. У режимі «кожна категорія» кандидати спершу ранжуються за кількістю нових точок ≤ 5 хв у категоріях, що ще нижче цілі. Пошук зупиняється, коли досягнуто ціль покриття, приріст за 5 хв стає меншим за поріг або вичерпано ліміт кроків. Час ходьби скрізь = відстань / 1.38 м/с.</p>
                    <p class="mt-2 text-xs italic">* Результат залежить від набору контрольних точок і якості пішохідного графа OSM; перед встановленням перевірте місце на місцевості.</p>`

    const html = renderReportPage({
        title: `Звіт оптимізації розміщення вбиралень (${analysisLabel})`,
        heading: `📍 Оптимізація розміщення міських вбиралень (${analysisLabel})`,
        subtitleHtml: `Звіт сформовано: <span class="font-medium text-slate-700">${dateStr}, ${timeStr}</span> · багатокрокова симуляція «що, якщо»`,
        bodyHtml:
            kpis +
            renderSection({
                title: `Рекомендовані місця для нових вбиралень (${rows.length} ${rows.length === 1 ? 'крок' : 'кроків'})`,
                badge: `Кандидатних вузлів: ${summary.totalCandidates}`,
                bodyHtml: renderTopTable(rows),
            }) +
            renderCategoryImpact(summary) +
            (mapBlock
                ? renderSection({
                    title: 'Схема розміщення',
                    bodyHtml: mapBlock,
                })
                : '') +
            renderParams(summary),
        footerHtml: renderFooterColumns(legend, notes),
    })

    downloadFile(html, `optimization_report_${modeFilename}_${localFilenameDate()}.html`, 'text/html;charset=utf-8;')
}

// ==========================================================
// CSV
// ==========================================================

export function exportOptimizationReportCsv(summary: OptimizationSummary, toilets: Toilet[]): void {
    const rows = buildRows(summary, toilets)
    const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const { label: analysisLabel, filename: modeFilename } = getAnalysisMode(summary)

    let csv = `${q(`Звіт оптимізації розміщення вбиралень (${analysisLabel})`)}\n\n`
    csv += [
        '№', 'Широта', 'Довгота', 'Δ покриття 5 хв (%)', 'Δ покриття 10 хв (%)', 'Δ точок 5 хв', 'Δ точок 10 хв', 'Δ сер. відстані (м)',
        'Покриття 5 хв (%)', 'Покриття 10 хв (%)', 'Покращено точок',
        'Сер. відстань ходу (м)', 'Сер. час ходу (хв)', 'Сер. CF',
        'До найближчої наявної (м)', 'Найближча наявна', 'Посилання',
    ].join(';') + '\n'

    for (const r of rows) {
        const c = r.candidate
        csv += [
            r.rank, c.latitude, c.longitude, c.deltaCoverage5, c.deltaCoverage10, c.deltaCount5 ?? '', c.deltaCount10 ?? '', Math.round(c.deltaWalkingDistance ?? 0),
            c.coverage5, c.coverage10, c.improvedPoints,
            Math.round(c.avgWalkingDistance), c.avgWalkingTime, c.avgCircuity,
            r.distanceToNearestExistingM ?? '', q(r.nearestExistingName), mapsLink(c),
        ].join(';') + '\n'
    }

    csv += '\nПАРАМЕТРИ;\n'
    csv += `Базове покриття 5 хв;${summary.baseline.coverage5}%\n`
    csv += `Базове покриття 10 хв;${summary.baseline.coverage10}%\n`
    csv += `Базова сер. відстань;${Math.round(summary.baseline.avgWalkingDistance)} м\n`
    csv += `Кандидатних вузлів;${summary.totalCandidates}\n`
    csv += `Оцінено через OSRM;${summary.evaluatedCandidates ?? ''}\n`
    if (summary.params) {
        csv += `Крок сітки;${summary.params.gridStepDegrees}\n`
        csv += `Макс. відстань до мережі (м);${summary.params.maxSnapDistanceMeters}\n`
        csv += `Мін. відстань до наявних (м);${summary.params.minDistanceToExistingMeters}\n`
        if (summary.params.minCandidateSeparationMeters != null) csv += `Мін. відстань між обраними кандидатами (м);${summary.params.minCandidateSeparationMeters}\n`
        if (summary.params.targetCoverage5Percent != null) csv += `Ціль покриття за 5 хв (%);${summary.params.targetCoverage5Percent}\n`
        if (summary.params.minCoverageGainPercent != null) csv += `Мін. приріст покриття (%);${summary.params.minCoverageGainPercent}\n`
        if (summary.params.deficitRingRadiiMeters) csv += `Кільця навколо дефіцитних точок (м);${summary.params.deficitRingRadiiMeters.join('/')}\n`
        if (summary.params.mode) csv += `Режим;${summary.params.mode === 'per-category' ? 'кожна категорія' : 'загальне покриття'}\n`
        if (summary.params.maxSteps != null) csv += `Макс. кроків;${summary.params.maxSteps}\n`
        if (summary.stopReason) csv += `Причина зупинки;${STOP_REASON_LABELS[summary.stopReason]}\n`
    }

    if (summary.categoryImpact?.length) {
        csv += '\nВПЛИВ НА КАТЕГОРІЇ;\n'
        csv += 'Категорія;n;5 хв до;5 хв після;10 хв до;10 хв після\n'
        for (const c of summary.categoryImpact) {
            csv += `${categoryLabel(c.category)};${c.n};${c.before5};${c.after5};${c.before10};${c.after10}\n`
        }
    }

    downloadFile(csv, `optimization_report_${modeFilename}_${localFilenameDate()}.csv`, 'text/csv;charset=utf-8;')
}