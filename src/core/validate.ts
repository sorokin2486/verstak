import {
  DRAWING_FORMAT, PARAM_KINDS, SHAPE_STYLES,
  type Dim, type Drawing, type Point, type View,
} from './types.ts';

export interface ValidationResult {
  readonly ok: boolean;
  readonly drawing: Drawing | null;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isPoint = (v: unknown): v is Point => Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]);
const isNumPair = (v: unknown): boolean => Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]);
const isExt = (v: unknown): boolean =>
  Array.isArray(v) && v.length === 2 && v.every((e) => e === null || isNum(e));

const ID_RE = /^[A-Za-z][A-Za-z0-9_]{0,15}$/;
const VIEW_ID_RE = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
const ANCHORS = ['start', 'middle', 'end'];

/** Ids that collide with Object.prototype members ("constructor", "toString", …). */
export const isReservedId = (id: string): boolean => id in Object.prototype || id === '__proto__';
const PATH_RE = /^[MLHVACQSTZmlhvacqstz0-9eE.,\s+-]+$/;

/** Validates untrusted JSON as a Drawing. Errors block rendering; warnings do not. */
export function validateDrawing(input: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const err = (m: string) => { errors.push(m); };

  if (!isObj(input)) {
    return { ok: false, drawing: null, errors: ['Файл чертежа должен быть JSON-объектом'], warnings };
  }
  const d = input;
  if (d.format !== DRAWING_FORMAT) err(`format должен быть "${DRAWING_FORMAT}"`);
  for (const k of ['id', 'title', 'units'] as const) {
    if (!isStr(d[k]) || d[k] === '') err(`${k}: нужна непустая строка`);
  }
  if (!Number.isInteger(d.revision) || (d.revision as number) < 1) err('revision: целое число ≥ 1');
  if (d.steps !== undefined && !(Array.isArray(d.steps) && d.steps.every(isStr))) err('steps: массив строк');
  if (d.stamp !== undefined && !(isObj(d.stamp) && Object.values(d.stamp).every(isStr))) err('stamp: объект строк');
  if (d.legend !== undefined) {
    if (!isObj(d.legend)) err('legend: объект');
    else for (const k of Object.keys(d.legend)) {
      if (!SHAPE_STYLES.includes(k as never)) err(`legend.${k}: неизвестный стиль`);
    }
  }

  const groupIds = checkGroups(d.groups, err);
  const paramIds = checkParams(d.params, groupIds, err);
  const shown = checkViews(d.views, paramIds, err, warnings);

  for (const id of paramIds) {
    if (!shown.has(id)) warnings.push(`Параметр ${id} не показан ни на одном виде`);
  }
  if (errors.length > 0) return { ok: false, drawing: null, errors, warnings };
  return { ok: true, drawing: input as unknown as Drawing, errors, warnings };
}

function checkGroups(groups: unknown, err: (m: string) => void): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(groups) || groups.length === 0) { err('groups: нужен непустой массив'); return ids; }
  groups.forEach((g, i) => {
    if (!isObj(g) || !isStr(g.id) || !isStr(g.title)) { err(`groups[${i}]: нужны id и title`); return; }
    if (ids.has(g.id)) err(`groups: повтор id "${g.id}"`);
    ids.add(g.id);
  });
  return ids;
}

function checkParams(params: unknown, groupIds: Set<string>, err: (m: string) => void): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(params) || params.length === 0) { err('params: нужен непустой массив'); return ids; }
  params.forEach((p, i) => {
    if (!isObj(p)) { err(`params[${i}]: объект`); return; }
    const where = `params[${i}]${isStr(p.id) ? ` (${p.id})` : ''}`;
    if (!isStr(p.id) || !ID_RE.test(p.id)) err(`${where}: id — буква и до 15 букв/цифр/_`);
    else if (isReservedId(p.id)) err(`${where}: id "${p.id}" зарезервирован, выбери другую букву`);
    else if (ids.has(p.id)) err(`params: повтор id "${p.id}"`);
    else ids.add(p.id);
    if (!isStr(p.label) || p.label === '') err(`${where}: нужен label`);
    if (!isStr(p.group) || !groupIds.has(p.group)) err(`${where}: группа "${String(p.group)}" не найдена`);
    if (p.kind !== undefined && !PARAM_KINDS.includes(p.kind as never)) err(`${where}: kind "${String(p.kind)}" неизвестен`);
    if (p.approx !== undefined && !(isNum(p.approx) && p.approx > 0)) err(`${where}: approx — положительное число`);
  });
  return ids;
}

function checkViews(
  views: unknown, paramIds: Set<string>, err: (m: string) => void, warnings: string[],
): Set<string> {
  const shown = new Set<string>();
  if (!Array.isArray(views) || views.length === 0) { err('views: нужен непустой массив'); return shown; }
  const viewIds = new Set<string>();
  views.forEach((v, i) => {
    if (!isObj(v)) { err(`views[${i}]: объект`); return; }
    const where = `views[${i}]${isStr(v.id) ? ` (${v.id})` : ''}`;
    if (!isStr(v.id) || !VIEW_ID_RE.test(v.id)) err(`${where}: id — латиница, цифры, _ и -`);
    else if (viewIds.has(v.id)) err(`views: повтор id "${v.id}"`);
    else viewIds.add(v.id);
    if (!isStr(v.title)) err(`${where}: нужен title`);
    const box = v.box;
    const boxOk = Array.isArray(box) && box.length === 4 && box.every(isNum) && box[2] > 0 && box[3] > 0;
    if (!boxOk) err(`${where}: box — [minX, minY, ширина, высота]`);
    if (!Array.isArray(v.shapes)) err(`${where}: shapes — массив`);
    else v.shapes.forEach((s, j) => checkShape(s, `${where}.shapes[${j}]`, err));
    if (!Array.isArray(v.dims)) { err(`${where}: dims — массив`); return; }
    v.dims.forEach((dm, j) => {
      const dWhere = `${where}.dims[${j}]`;
      const param = checkDim(dm, dWhere, err);
      if (param === null) return;
      if (!paramIds.has(param)) err(`${dWhere}: параметр "${param}" не объявлен в params`);
      shown.add(param);
      if (boxOk) {
        const outside = dimPoints(dm as Dim).some((p) => !inBox(p, box as unknown as View['box']));
        if (outside) warnings.push(`${dWhere} (${param}): точка за пределами box`);
      }
    });
  });
  return shown;
}

function checkShape(s: unknown, where: string, err: (m: string) => void): void {
  if (!isObj(s)) { err(`${where}: объект`); return; }
  if (s.style !== undefined && !SHAPE_STYLES.includes(s.style as never)) err(`${where}: стиль "${String(s.style)}" неизвестен`);
  switch (s.type) {
    case 'path':
      if (!isStr(s.d) || !PATH_RE.test(s.d)) err(`${where}: d — путь SVG только из команд MLHVACQSTZ и чисел`);
      return;
    case 'rect':
      if (![s.x, s.y, s.w, s.h].every(isNum) || (s.rx !== undefined && !isNum(s.rx))) err(`${where}: rect — x, y, w, h числа`);
      return;
    case 'circle':
      if (![s.cx, s.cy, s.r].every(isNum)) err(`${where}: circle — cx, cy, r числа`);
      return;
    case 'line':
      if (!isPoint(s.from) || !isPoint(s.to)) err(`${where}: line — from и to точки [x, y]`);
      return;
    case 'polyline':
      if (!Array.isArray(s.points) || s.points.length < 2 || !s.points.every(isPoint)) err(`${where}: polyline — ≥2 точек`);
      return;
    case 'text':
      if (!isPoint(s.at) || !isStr(s.text)) err(`${where}: text — at и text`);
      if (s.size !== undefined && !(isNum(s.size) && s.size > 0)) err(`${where}: size — положительное число`);
      if (s.anchor !== undefined && !ANCHORS.includes(s.anchor as string)) err(`${where}: anchor — start | middle | end`);
      return;
    default:
      err(`${where}: неизвестный type "${String(s.type)}"`);
  }
}

/** Returns the referenced param id, or null when the dim is malformed. */
function checkDim(dm: unknown, where: string, err: (m: string) => void): string | null {
  if (!isObj(dm)) { err(`${where}: объект`); return null; }
  if (!isStr(dm.param)) { err(`${where}: нужен param`); return null; }
  if (dm.ext !== undefined && !isExt(dm.ext)) { err(`${where}: ext — [число|null, число|null]`); return null; }
  switch (dm.type) {
    case 'hdim':
      if (!isNumPair(dm.x) || !isNum(dm.y)) { err(`${where}: hdim — x: [x1, x2], y: число`); return null; }
      return dm.param;
    case 'vdim':
      if (!isNumPair(dm.y) || !isNum(dm.x)) { err(`${where}: vdim — y: [y1, y2], x: число`); return null; }
      return dm.param;
    case 'leader':
      if (!isPoint(dm.at) || !isPoint(dm.label)) { err(`${where}: leader — at и label точки`); return null; }
      return dm.param;
    default:
      err(`${where}: неизвестный type "${String(dm.type)}"`);
      return null;
  }
}

function dimPoints(dm: Dim): Point[] {
  switch (dm.type) {
    case 'hdim': return [[dm.x[0], dm.y], [dm.x[1], dm.y]];
    case 'vdim': return [[dm.x, dm.y[0]], [dm.x, dm.y[1]]];
    case 'leader': return [dm.at, dm.label];
  }
}

function inBox(p: Point, box: View['box']): boolean {
  const [x, y, w, h] = box;
  return p[0] >= x && p[0] <= x + w && p[1] >= y && p[1] <= y + h;
}
