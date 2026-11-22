import { esc } from './escape.ts';
import { renderView, type RenderState } from './render.ts';
import type { Theme } from './theme.ts';
import { SHAPE_STYLES, type Drawing } from './types.ts';

/** Title-block rows shown under the drawing (app and PNG preview). */
export function stampRows(drawing: Drawing): ReadonlyArray<readonly [string, string]> {
  return [
    ['Наименование', drawing.title],
    ['Масштаб', drawing.scale ?? 'без масштаба'],
    ['Ед. изм.', drawing.units],
    ...Object.entries(drawing.stamp ?? {}),
    ['Ревизия', String(drawing.revision)],
  ];
}

/** Legend entries for styles that are both labelled and actually used. */
export function legendEntries(drawing: Drawing): ReadonlyArray<readonly [string, string]> {
  const used = new Set(drawing.views.flatMap((v) => v.shapes.map((s) => (s.type === 'text' ? null : s.style ?? 'part'))));
  return SHAPE_STYLES.filter((st) => used.has(st) && drawing.legend?.[st])
    .map((st) => [st, drawing.legend?.[st] ?? ''] as const);
}

const VIEW_HEIGHT = 760;
const GAP = 40;
const PAD = 32;

/** Whole sheet as one SVG (all views side by side at equal height) — used for PNG previews. */
export function renderSheet(drawing: Drawing, state: RenderState, theme: Theme): string {
  const widths = drawing.views.map((v) => (v.box[2] / v.box[3]) * VIEW_HEIGHT);
  const viewsWidth = widths.reduce((a, b) => a + b, 0) + GAP * (widths.length - 1);
  const width = Math.max(viewsWidth, 900) + PAD * 2;
  const top = PAD + 56;
  let x = PAD;
  const views = drawing.views.map((v, i) => {
    const svg = renderView(drawing, v, state, theme)
      .replace('<svg ', `<svg x="${x}" y="${top + 28}" width="${widths[i]}" height="${VIEW_HEIGHT}" `);
    const cap = `<text x="${x}" y="${top + 14}" font-family="${esc(theme.mono)}" font-size="14" ` +
      `fill="${theme.muted}">${esc(v.title.toUpperCase())}</text>`;
    x += widths[i] + GAP;
    return cap + svg;
  }).join('');

  const rows = stampRows(drawing);
  const stampTop = top + 28 + VIEW_HEIGHT + 28;
  const stamp = rows.map(([k, v], i) => {
    const y = stampTop + i * 24 + 17;
    return `<text x="${PAD}" y="${y}" font-family="${esc(theme.mono)}" font-size="14" fill="${theme.muted}">${esc(k)}</text>` +
      `<text x="${PAD + 150}" y="${y}" font-family="${esc(theme.mono)}" font-size="14" fill="${theme.ink}">${esc(v)}</text>`;
  }).join('');
  const legend = legendEntries(drawing).map(([st, label], i) => {
    const y = stampTop + i * 24 + 17;
    return `<text x="${width / 2}" y="${y}" font-family="${esc(theme.sans)}" font-size="14" fill="${theme.muted}">` +
      `${esc(st)} — ${esc(label)}</text>`;
  }).join('');
  const height = stampTop + Math.max(rows.length, 1) * 24 + PAD;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width)}" height="${Math.round(height)}" ` +
    `viewBox="0 0 ${Math.round(width)} ${Math.round(height)}">` +
    `<rect width="100%" height="100%" fill="${theme.sheet}"/>` +
    `<text x="${PAD}" y="${PAD + 24}" font-family="${esc(theme.sans)}" font-size="26" font-weight="600" ` +
    `fill="${theme.ink}">${esc(drawing.title)}</text>${views}${stamp}${legend}</svg>`;
}
