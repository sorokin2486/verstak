import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Drawing } from '../src/core/types.ts';

export function easelBracket(): Drawing {
  const path = fileURLToPath(new URL('../examples/easel-bracket/drawing.json', import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8')) as Drawing;
}

/** Smallest valid drawing; tests derive broken variants from it. */
export function minimal(): Drawing {
  return {
    format: 'verstak/1',
    id: 'plate',
    title: 'Пластина',
    revision: 1,
    units: 'мм',
    groups: [{ id: 'g', title: 'Основное' }],
    params: [
      { id: 'A', label: 'Длина', group: 'g', approx: 50 },
      { id: 'D', label: 'Отверстие', group: 'g', kind: 'diameter', critical: true },
    ],
    views: [{
      id: 'top',
      title: 'Сверху',
      box: [0, 0, 200, 100],
      shapes: [
        { type: 'rect', x: 10, y: 10, w: 150, h: 60 },
        { type: 'circle', cx: 80, cy: 40, r: 10, style: 'hidden' },
      ],
      dims: [
        { type: 'hdim', param: 'A', x: [10, 160], y: 85, ext: [70, 70] },
        { type: 'leader', param: 'D', at: [87, 33], label: [130, 20] },
      ],
    }],
  };
}
