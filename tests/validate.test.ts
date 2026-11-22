import { describe, expect, it } from 'vitest';
import { validateDrawing } from '../src/core/validate.ts';
import { easelBracket, minimal } from './fixtures.ts';

const withPatch = (patch: Record<string, unknown>): unknown => ({ ...minimal(), ...patch });

describe('validateDrawing', () => {
  it('accepts the easel bracket example without errors or warnings', () => {
    const r = validateDrawing(easelBracket());
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('accepts the minimal drawing', () => {
    expect(validateDrawing(minimal()).ok).toBe(true);
  });

  it('rejects non-objects', () => {
    expect(validateDrawing(null).ok).toBe(false);
    expect(validateDrawing([]).errors[0]).toMatch(/JSON-объектом/);
  });

  it('rejects a wrong format tag and a bad revision', () => {
    const r = validateDrawing(withPatch({ format: 'other', revision: 0 }));
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toMatch(/format/);
    expect(r.errors.join('\n')).toMatch(/revision/);
  });

  it('reports a dimension that references an undeclared param', () => {
    const d = minimal();
    const views = [{ ...d.views[0], dims: [...d.views[0].dims, { type: 'vdim', param: 'Q', y: [10, 70], x: 180 }] }];
    const r = validateDrawing({ ...d, views });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toMatch(/"Q" не объявлен/);
  });

  it('reports duplicate param ids and unknown groups', () => {
    const d = minimal();
    const r = validateDrawing({ ...d, params: [...d.params, { id: 'A', label: 'x', group: 'nope' }] });
    expect(r.errors.join('\n')).toMatch(/повтор id "A"/);
    expect(r.errors.join('\n')).toMatch(/группа "nope"/);
  });

  it('rejects path data with anything but SVG path commands', () => {
    const d = minimal();
    const views = [{ ...d.views[0], shapes: [{ type: 'path', d: 'M0 0 L10 10" onload="x' }] }];
    expect(validateDrawing({ ...d, views }).errors.join('\n')).toMatch(/путь SVG/);
  });

  it('rejects unknown shape and dim types and styles', () => {
    const d = minimal();
    const views = [{
      ...d.views[0],
      shapes: [{ type: 'blob' }, { type: 'rect', x: 0, y: 0, w: 1, h: 1, style: 'neon' }],
      dims: [{ type: 'adim', param: 'A' }],
    }];
    const text = validateDrawing({ ...d, views }).errors.join('\n');
    expect(text).toMatch(/type "blob"/);
    expect(text).toMatch(/стиль "neon"/);
    expect(text).toMatch(/type "adim"/);
  });

  it('warns (but passes) when a param is not shown or a point is outside the box', () => {
    const d = minimal();
    const views = [{ ...d.views[0], dims: [{ type: 'hdim', param: 'A', x: [10, 500], y: 85 }] }];
    const r = validateDrawing({ ...d, views });
    expect(r.ok).toBe(true);
    expect(r.warnings.join('\n')).toMatch(/D не показан/);
    expect(r.warnings.join('\n')).toMatch(/за пределами box/);
  });

  it('rejects ids that collide with Object.prototype and unsafe view ids', () => {
    const d = minimal();
    const r = validateDrawing({
      ...d,
      params: [...d.params, { id: 'constructor', label: 'x', group: 'g' }],
      views: [{ ...d.views[0], id: 'a"b' }],
    });
    expect(r.errors.join('\n')).toMatch(/"constructor" зарезервирован/);
    expect(r.errors.join('\n')).toMatch(/id — латиница/);
  });

  it('validates text anchor and size so they cannot inject attributes', () => {
    const d = minimal();
    const views = [{ ...d.views[0], shapes: [{ type: 'text', at: [0, 0], text: 't', anchor: 'x" style="y', size: -1 }] }];
    const text = validateDrawing({ ...d, views }).errors.join('\n');
    expect(text).toMatch(/anchor/);
    expect(text).toMatch(/size/);
  });

  it('validates malformed geometry fields', () => {
    const d = minimal();
    const views = [{
      ...d.views[0],
      box: [0, 0, -1, 10],
      shapes: [
        { type: 'circle', cx: 1, cy: 'a', r: 1 },
        { type: 'line', from: [0], to: [1, 1] },
        { type: 'polyline', points: [[0, 0]] },
        { type: 'text', at: [0, 0] },
      ],
      dims: [
        { type: 'hdim', param: 'A', x: [1], y: 1 },
        { type: 'vdim', param: 'A', y: [1, 2] },
        { type: 'leader', param: 'D', at: [1, 1] },
        { type: 'hdim', param: 'A', x: [1, 2], y: 1, ext: [1, 'x'] },
      ],
    }];
    const errors = validateDrawing({ ...d, views }).errors;
    expect(errors.length).toBeGreaterThanOrEqual(9);
  });
});
