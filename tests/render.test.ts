import { describe, expect, it } from 'vitest';
import { renderView, tagText, viewScale } from '../src/core/render.ts';
import { legendEntries, renderSheet, stampRows } from '../src/core/sheet.ts';
import { DARK } from '../src/core/theme.ts';
import { easelBracket, minimal } from './fixtures.ts';

const empty = { values: {}, active: null };

describe('renderView', () => {
  it('renders every shape and one dim group per dimension', () => {
    const d = easelBracket();
    const svg = renderView(d, d.views[0], empty, DARK);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('viewBox="-110 -130 1370 1330"');
    expect(svg.match(/<g class="dim/g)?.length).toBe(d.views[0].dims.length);
    expect(svg.match(/class="s-hidden"/g)?.length).toBe(3);
    expect(svg).toContain('url(#hatch-side)');
  });

  it('shows entered values and marks the dim as done', () => {
    const d = minimal();
    const svg = renderView(d, d.views[0], { values: { A: '55.2' }, active: null }, DARK);
    expect(svg).toContain('>A=55.2<');
    expect(svg).toMatch(/class="dim done" data-k="A"/);
  });

  it('marks the active and critical dims and colours the active one with the accent', () => {
    const d = minimal();
    const svg = renderView(d, d.views[0], { values: {}, active: 'D' }, DARK);
    expect(svg).toMatch(/class="dim on crit" data-k="D"/);
    const dGroup = svg.slice(svg.indexOf('data-k="D"'));
    expect(dGroup).toContain(DARK.accent);
  });

  it('escapes text so drawing content cannot inject markup', () => {
    const d = minimal();
    const view = { ...d.views[0], title: '<b>"x"</b>', shapes: [{ type: 'text' as const, at: [0, 0] as const, text: '<script>' }] };
    const svg = renderView(d, view, { values: { A: '<i>' }, active: null }, DARK);
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).toContain('aria-label="&lt;b&gt;&quot;x&quot;&lt;/b&gt;"');
    expect(svg).not.toContain('<i>');
  });

  it('draws short dims with outside arrows and the tag above', () => {
    const d = minimal();
    const view = { ...d.views[0], box: [0, 0, 1330, 1330] as const, dims: [{ type: 'hdim' as const, param: 'A', x: [100, 140] as const, y: 500 }] };
    const svg = renderView(d, view, empty, DARK);
    expect(svg).toContain('x1="68" y1="500" x2="172" y2="500"');
  });

  it('renders vdims, polylines and lines, including reversed coordinates', () => {
    const d = minimal();
    const view = {
      ...d.views[0],
      box: [0, 0, 1330, 1330] as const,
      shapes: [
        { type: 'polyline' as const, points: [[0, 0], [10, 10]] as const, style: 'center' as const },
        { type: 'polyline' as const, points: [[0, 0], [10, 10], [0, 10]] as const, closed: true, style: 'thin' as const },
        { type: 'line' as const, from: [0, 0] as const, to: [5, 5] as const, style: 'section' as const },
        { type: 'path' as const, d: 'M0 0 H10' },
      ],
      dims: [
        { type: 'vdim' as const, param: 'A', y: [900, 100] as const, x: 50, ext: [10, null] as const },
        { type: 'vdim' as const, param: 'D', y: [100, 130] as const, x: 50 },
        { type: 'hdim' as const, param: 'A', x: [900, 100] as const, y: 50, ext: [null, 300] as const },
      ],
    };
    const svg = renderView(d, view, empty, DARK);
    expect(svg).toContain('<polyline class="s-center"');
    expect(svg).toContain('<polygon class="s-thin"');
    expect(svg).toContain('<line class="s-section"');
    expect(svg).toContain('<path class="s-part"');
    expect(svg.match(/class="ext"/g)?.length).toBe(2);
  });
});

describe('helpers', () => {
  it('formats tag text by param kind', () => {
    expect(tagText(undefined, 'A', undefined)).toBe('A');
    expect(tagText({ id: 'D', label: '', group: 'g', kind: 'diameter' }, 'D', '8')).toBe('D=⌀8');
    expect(tagText({ id: 'R', label: '', group: 'g', kind: 'radius' }, 'R', '3')).toBe('R=R3');
    expect(tagText({ id: 'a', label: '', group: 'g', kind: 'angle' }, 'a', '30')).toBe('a=30°');
  });

  it('scales sizes with view height', () => {
    expect(viewScale(minimal().views[0])).toBeCloseTo(100 / 1330);
  });

  it('builds the stamp and legend', () => {
    const d = easelBracket();
    expect(stampRows(d)).toContainEqual(['Кол-во', '2 шт.']);
    expect(stampRows(d).at(-1)).toEqual(['Ревизия', '1']);
    expect(legendEntries(d).map(([s]) => s)).toEqual(['part', 'hidden', 'section']);
    expect(legendEntries(minimal())).toEqual([]);
  });

  it('renders a whole sheet as one svg', () => {
    const svg = renderSheet(easelBracket(), empty, DARK);
    expect(svg.match(/<svg /g)?.length).toBe(3);
    expect(svg).toContain('Кронштейн полочки детского мольберта');
  });
});
