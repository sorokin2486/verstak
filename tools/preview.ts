// Usage: node tools/preview.ts <part-folder | drawing.json> [out.png] [--active A] [--no-values]
// Renders the whole sheet with the same renderer the app uses, so Claude can look at it.
// Values from measurements.json next to the drawing are drawn unless --no-values is given.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { parseMeasurements } from '../src/core/measurements.ts';
import { renderSheet } from '../src/core/sheet.ts';
import { DARK } from '../src/core/theme.ts';
import { validateDrawing } from '../src/core/validate.ts';
import { drawingPath, readJson } from './load.ts';

const args = process.argv.slice(2);
const flag = (name: string): string | null => {
  const i = args.indexOf(name);
  return i >= 0 ? (args[i + 1] ?? null) : null;
};
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1] === '--active'));
if (positional.length === 0) {
  console.error('Использование: node tools/preview.ts <папка детали | drawing.json> [out.png] [--active A] [--no-values]');
  process.exit(2);
}

const path = drawingPath(positional[0]);
const result = validateDrawing(readJson(path));
if (!result.ok || !result.drawing) {
  console.error(`✗ ${path}: чертёж с ошибками, сначала node tools/validate.ts`);
  for (const e of result.errors) console.error(`  - ${e}`);
  process.exit(1);
}
const drawing = result.drawing;

let values: Record<string, string> = {};
const mPath = join(dirname(path), 'measurements.json');
if (!args.includes('--no-values') && existsSync(mPath)) {
  const m = parseMeasurements(readJson(mPath), drawing.revision);
  values = Object.fromEntries(Object.entries(m.values).map(([k, v]) => [k, v.value]));
}

const out = positional[1] ?? join(dirname(path), 'drawing.preview.png');
const svg = renderSheet(drawing, { values, active: flag('--active') }, DARK);
const png = new Resvg(svg, {
  font: { loadSystemFonts: true, defaultFontFamily: 'Segoe UI' },
  fitTo: { mode: 'width', value: 1800 },
}).render().asPng();
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png);
console.log(`✓ ${out}`);
