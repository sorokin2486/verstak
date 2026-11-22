import { esc } from './escape.ts';
import type { Theme } from './theme.ts';
import type { Dim, Drawing, Param, Point, Shape, ShapeStyle, View } from './types.ts';

/** What the drawing shows besides geometry: entered values and the highlighted param. */
export interface RenderState {
  readonly values: Readonly<Record<string, string>>;
  readonly active: string | null;
}

/** Reference view height the base sizes were tuned for (prototype sheet). */
const BASE_HEIGHT = 1330;
const SHORT_DIM = 80;

interface Ctx {
  readonly k: number;
  readonly theme: Theme;
  readonly state: RenderState;
  readonly params: ReadonlyMap<string, Param>;
}

const n = (v: number): string => String(Math.round(v * 100) / 100);

/** Size factor for a view: text and strokes scale with the view height. */
export function viewScale(view: View): number {
  return view.box[3] / BASE_HEIGHT;
}

/** Text shown in a dimension tag: "A" or "A=55", with ⌀/R/° for diameters, radii, angles. */
export function tagText(param: Param | undefined, id: string, value: string | undefined): string {
  if (!value) return id;
  switch (param?.kind) {
    case 'diameter': return `${id}=⌀${value}`;
    case 'radius': return `${id}=R${value}`;
    case 'angle': return `${id}=${value}°`;
    default: return `${id}=${value}`;
  }
}

/** Renders one view as a standalone <svg> element string. */
export function renderView(drawing: Drawing, view: View, state: RenderState, theme: Theme): string {
  const ctx: Ctx = {
    k: viewScale(view),
    theme,
    state,
    params: new Map(drawing.params.map((p) => [p.id, p])),
  };
  const [x, y, w, h] = view.box;
  const body = defs(view, ctx) + view.shapes.map((s) => shape(s, view, ctx)).join('') +
    view.dims.map((d) => dim(d, ctx)).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" class="view-svg" data-view="${esc(view.id)}" ` +
    `viewBox="${n(x)} ${n(y)} ${n(w)} ${n(h)}" role="img" aria-label="${esc(view.title)}">${body}</svg>`;
}

/** View ids are validated (VIEW_ID_RE), so they are safe and unique as pattern ids. */
const hatchId = (view: View): string => `hatch-${view.id}`;

function defs(view: View, { k, theme }: Ctx): string {
  const s = 12 * k;
  return `<defs><pattern id="${hatchId(view)}" width="${n(s)}" height="${n(s)}" patternUnits="userSpaceOnUse" ` +
    `patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="${n(s)}" stroke="${theme.muted}" ` +
    `stroke-width="${n(2 * k)}"/></pattern></defs>`;
}

function styleAttrs(style: ShapeStyle, view: View, { k, theme }: Ctx): string {
  switch (style) {
    case 'part':
      return `class="s-part" fill="${theme.partFill}" stroke="${theme.ink}" stroke-width="${n(3 * k)}" stroke-linejoin="round"`;
    case 'hidden':
      return `class="s-hidden" fill="${theme.pocketFill}" stroke="${theme.ink}" stroke-width="${n(1.5 * k)}" ` +
        `stroke-dasharray="${n(8 * k)} ${n(6 * k)}"`;
    case 'section':
      return `class="s-section" fill="url(#${hatchId(view)})" stroke="${theme.ink}" stroke-width="${n(2.5 * k)}"`;
    case 'center':
      return `class="s-center" fill="none" stroke="${theme.muted}" stroke-width="${n(1.2 * k)}" ` +
        `stroke-dasharray="${n(24 * k)} ${n(6 * k)} ${n(4 * k)} ${n(6 * k)}"`;
    case 'thin':
      return `class="s-thin" fill="none" stroke="${theme.ink}" stroke-width="${n(1.2 * k)}"`;
  }
}

const pts = (points: readonly Point[]): string => points.map((p) => `${n(p[0])},${n(p[1])}`).join(' ');

function shape(s: Shape, view: View, ctx: Ctx): string {
  if (s.type === 'text') {
    const size = s.size ?? 22 * ctx.k;
    return `<text x="${n(s.at[0])}" y="${n(s.at[1])}" font-size="${n(size)}" font-family="${esc(ctx.theme.sans)}" ` +
      `fill="${ctx.theme.ink}" text-anchor="${esc(s.anchor ?? 'start')}">${esc(s.text)}</text>`;
  }
  const a = styleAttrs(s.style ?? 'part', view, ctx);
  switch (s.type) {
    case 'path': return `<path ${a} d="${esc(s.d)}"/>`;
    case 'rect':
      return `<rect ${a} x="${n(s.x)}" y="${n(s.y)}" width="${n(s.w)}" height="${n(s.h)}"${s.rx ? ` rx="${n(s.rx)}"` : ''}/>`;
    case 'circle': return `<circle ${a} cx="${n(s.cx)}" cy="${n(s.cy)}" r="${n(s.r)}"/>`;
    case 'line':
      return `<line ${a} x1="${n(s.from[0])}" y1="${n(s.from[1])}" x2="${n(s.to[0])}" y2="${n(s.to[1])}"/>`;
    case 'polyline':
      return s.closed ? `<polygon ${a} points="${pts(s.points)}"/>` : `<polyline ${a} points="${pts(s.points)}"/>`;
  }
}

/* ---------- dimensions ---------- */

function line(x1: number, y1: number, x2: number, y2: number, ctx: Ctx, cls = ''): string {
  const w = cls === 'ext' ? 1.1 : 1.6;
  return `<line${cls ? ` class="${cls}"` : ''} x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" ` +
    `stroke="${ctx.theme.muted}" stroke-width="${n(w * ctx.k)}"/>`;
}

function arrowH(x: number, y: number, dir: number, { k, theme }: Ctx): string {
  const b = x - dir * 15 * k;
  return `<polygon points="${n(x)},${n(y)} ${n(b)},${n(y - 6 * k)} ${n(b)},${n(y + 6 * k)}" fill="${theme.muted}"/>`;
}

function arrowV(x: number, y: number, dir: number, { k, theme }: Ctx): string {
  const b = y - dir * 15 * k;
  return `<polygon points="${n(x)},${n(y)} ${n(x - 6 * k)},${n(b)} ${n(x + 6 * k)},${n(b)}" fill="${theme.muted}"/>`;
}

function tag(id: string, x: number, y: number, ctx: Ctx, align: 'middle' | 'start' = 'middle'): string {
  const { k, theme } = ctx;
  const param = ctx.params.get(id);
  const txt = tagText(param, id, ctx.state.values[id]);
  const w = (txt.length * 15.5 + 18) * k;
  const left = align === 'start' ? x : x - w / 2;
  const stroke = param?.critical ? theme.critical : theme.muted;
  return `<g class="tag" data-k="${esc(id)}"><rect x="${n(left)}" y="${n(y - 20 * k)}" width="${n(w)}" ` +
    `height="${n(40 * k)}" rx="${n(5 * k)}" fill="${theme.sheet}" stroke="${stroke}" stroke-width="${n(1.5 * k)}"/>` +
    `<text x="${n(left + w / 2)}" y="${n(y + 9 * k)}" text-anchor="middle" font-family="${esc(theme.mono)}" ` +
    `font-size="${n(25 * k)}" font-weight="600" fill="${theme.ink}">${esc(txt)}</text></g>`;
}

function wrap(id: string, inner: string, ctx: Ctx): string {
  const cls = ['dim'];
  if (ctx.state.values[id]) cls.push('done');
  if (ctx.state.active === id) cls.push('on');
  if (ctx.params.get(id)?.critical) cls.push('crit');
  return `<g class="${cls.join(' ')}" data-k="${esc(id)}">${inner}</g>`;
}

/** The highlighted dimension is drawn in the accent colour (also works without app CSS, e.g. PNG previews). */
function activeCtx(ctx: Ctx): Ctx {
  const t = ctx.theme;
  return { ...ctx, theme: { ...t, muted: t.accent, critical: t.accent, sheet: t.accent, ink: t.accentInk } };
}

function dim(dimension: Dim, base: Ctx): string {
  const d = dimension;
  const ctx = base.state.active === d.param ? activeCtx(base) : base;
  switch (d.type) {
    case 'hdim': return hdim(d.param, d.x[0], d.x[1], d.y, d.ext ?? [null, null], ctx);
    case 'vdim': return vdim(d.param, d.y[0], d.y[1], d.x, d.ext ?? [null, null], ctx);
    case 'leader': return leader(d.param, d.at, d.label, ctx);
  }
}

function hdim(id: string, xa: number, xb: number, y: number, ext: readonly (number | null)[], ctx: Ctx): string {
  const { k } = ctx;
  const [x1, x2] = xa <= xb ? [xa, xb] : [xb, xa];
  const [e1, e2] = xa <= xb ? ext : [ext[1], ext[0]];
  const extLine = (x: number, e: number | null | undefined): string => {
    if (e == null) return '';
    const s = y > e ? 1 : -1;
    return line(x, e + s * 6 * k, x, y + s * 12 * k, ctx, 'ext');
  };
  let s = extLine(x1, e1) + extLine(x2, e2);
  if (x2 - x1 < SHORT_DIM * k) {
    s += line(x1 - 32 * k, y, x2 + 32 * k, y, ctx) + arrowH(x1, y, 1, ctx) + arrowH(x2, y, -1, ctx);
    s += tag(id, (x1 + x2) / 2, y - 30 * k, ctx);
  } else {
    s += line(x1, y, x2, y, ctx) + arrowH(x1, y, -1, ctx) + arrowH(x2, y, 1, ctx);
    s += tag(id, (x1 + x2) / 2, y, ctx);
  }
  return wrap(id, s, ctx);
}

function vdim(id: string, ya: number, yb: number, x: number, ext: readonly (number | null)[], ctx: Ctx): string {
  const { k } = ctx;
  const [y1, y2] = ya <= yb ? [ya, yb] : [yb, ya];
  const [e1, e2] = ya <= yb ? ext : [ext[1], ext[0]];
  const extLine = (yy: number, e: number | null | undefined): string => {
    if (e == null) return '';
    const s = x > e ? 1 : -1;
    return line(e + s * 6 * k, yy, x + s * 12 * k, yy, ctx, 'ext');
  };
  let s = extLine(y1, e1) + extLine(y2, e2);
  if (y2 - y1 < SHORT_DIM * k) {
    s += line(x, y1 - 32 * k, x, y2 + 32 * k, ctx) + arrowV(x, y1, 1, ctx) + arrowV(x, y2, -1, ctx);
    s += tag(id, x + 16 * k, (y1 + y2) / 2, ctx, 'start');
  } else {
    s += line(x, y1, x, y2, ctx) + arrowV(x, y1, -1, ctx) + arrowV(x, y2, 1, ctx);
    s += tag(id, x, (y1 + y2) / 2, ctx);
  }
  return wrap(id, s, ctx);
}

function leader(id: string, at: Point, label: Point, ctx: Ctx): string {
  const dot = `<circle cx="${n(at[0])}" cy="${n(at[1])}" r="${n(6 * ctx.k)}" fill="${ctx.theme.muted}"/>`;
  return wrap(id, dot + line(at[0], at[1], label[0], label[1], ctx) + tag(id, label[0], label[1], ctx), ctx);
}
