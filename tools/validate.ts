// Usage: node tools/validate.ts <part-folder | drawing.json> [...more]
// Exit code 1 when any drawing has errors. Warnings are printed but do not fail.
import { validateDrawing } from '../src/core/validate.ts';
import { drawingPath, readJson } from './load.ts';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Использование: node tools/validate.ts <папка детали | drawing.json> ...');
  process.exit(2);
}

let failed = false;
for (const arg of args) {
  const path = drawingPath(arg);
  let input: unknown;
  try {
    input = readJson(path);
  } catch (e) {
    console.error(`✗ ${path}: не читается как JSON — ${(e as Error).message}`);
    failed = true;
    continue;
  }
  const r = validateDrawing(input);
  for (const w of r.warnings) console.log(`  ! ${w}`);
  if (r.ok) {
    console.log(`✓ ${path}: ок (${r.drawing?.params.length} параметров, ${r.drawing?.views.length} вида)`);
  } else {
    failed = true;
    console.error(`✗ ${path}: ${r.errors.length} ошибок`);
    for (const e of r.errors) console.error(`  - ${e}`);
  }
}
process.exit(failed ? 1 : 0);
