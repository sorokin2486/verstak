import {
  MEASUREMENTS_FORMAT,
  type Drawing, type LogEntry, type MeasuredValue, type Measurements, type MeasurementStatus, type Param,
} from './types.ts';

const MAX_INPUT = 16;
/** Values further than this factor from Claude's estimate get a typo warning. */
const APPROX_FACTOR = 2;

export function emptyMeasurements(revision: number): Measurements {
  return { format: MEASUREMENTS_FORMAT, drawingRevision: revision, status: 'in_progress', comment: '', values: {}, log: [] };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Reads measurements.json leniently: malformed entries are dropped, never thrown,
 * so a damaged file never blocks the user from measuring.
 */
export function parseMeasurements(input: unknown, fallbackRevision: number): Measurements {
  if (!isObj(input)) return emptyMeasurements(fallbackRevision);
  const values: Record<string, MeasuredValue> = {};
  if (isObj(input.values)) {
    for (const [id, v] of Object.entries(input.values)) {
      if (id in Object.prototype || id === '__proto__') continue;
      if (isObj(v) && typeof v.value === 'string' && v.value !== '') {
        values[id] = {
          value: v.value,
          updated: typeof v.updated === 'string' ? v.updated : '',
          drawingRevision: typeof v.drawingRevision === 'number' ? v.drawingRevision : fallbackRevision,
        };
      }
    }
  }
  const log: LogEntry[] = Array.isArray(input.log)
    ? input.log.filter((e): e is LogEntry => isObj(e) && typeof e.param === 'string' && typeof e.at === 'string')
    : [];
  return {
    format: MEASUREMENTS_FORMAT,
    drawingRevision: typeof input.drawingRevision === 'number' ? input.drawingRevision : fallbackRevision,
    status: input.status === 'done' ? 'done' : 'in_progress',
    comment: typeof input.comment === 'string' ? input.comment : '',
    values,
    log,
  };
}

/** Normalises typed input: comma → dot, only digits and separators for ranges/tapers ("40/38"). */
export function normalizeInput(raw: string): string {
  return raw.replace(/,/g, '.').replace(/[^0-9.\-–/ ]/g, '').slice(0, MAX_INPUT);
}

/** First number in a value ("40/38" → 40), or null. */
export function parseNumber(value: string): number | null {
  const m = /-?\d+(?:\.\d+)?/.exec(value);
  return m ? Number(m[0]) : null;
}

export function setValue(m: Measurements, id: string, raw: string, revision: number, now: string): Measurements {
  const value = normalizeInput(raw).trim();
  const values = { ...m.values };
  if (value === '') delete values[id];
  else values[id] = { value, updated: now, drawingRevision: revision };
  return { ...m, values, status: 'in_progress' };
}

/** Records a finished edit (on blur) in the log; no entry when nothing changed. */
export function logChange(m: Measurements, id: string, from: string | null, to: string | null, now: string): Measurements {
  if ((from ?? '') === (to ?? '')) return m;
  return { ...m, log: [...m.log, { at: now, param: id, from, to }] };
}

export function setComment(m: Measurements, comment: string): Measurements {
  return { ...m, comment };
}

export function setStatus(m: Measurements, status: MeasurementStatus): Measurements {
  return { ...m, status };
}

export function acknowledgeRevision(m: Measurements, revision: number): Measurements {
  return { ...m, drawingRevision: revision };
}

export interface Progress {
  readonly filled: number;
  readonly total: number;
  readonly missingRequired: readonly string[];
}

export function progress(drawing: Drawing, m: Measurements): Progress {
  const filled = drawing.params.filter((p) => m.values[p.id]).length;
  const missingRequired = drawing.params.filter((p) => !p.optional && !m.values[p.id]).map((p) => p.id);
  return { filled, total: drawing.params.length, missingRequired };
}

/** Warning text when a value is far from Claude's estimate (likely mm/cm mix-up), else null. */
export function approxWarning(param: Param, value: string | undefined): string | null {
  if (!value || !param.approx) return null;
  const v = parseNumber(value);
  if (v === null || v <= 0) return null;
  const ratio = v / param.approx;
  if (ratio > APPROX_FACTOR || ratio < 1 / APPROX_FACTOR) {
    return `Ожидалось около ${param.approx}. Проверь, не перепутаны ли мм и см.`;
  }
  return null;
}

/** Values kept for params that the current drawing no longer has. */
export function orphanValues(drawing: Drawing, m: Measurements): ReadonlyArray<readonly [string, MeasuredValue]> {
  const ids = new Set(drawing.params.map((p) => p.id));
  return Object.entries(m.values).filter(([id]) => !ids.has(id));
}

export function historyFor(m: Measurements, id: string): readonly LogEntry[] {
  return m.log.filter((e) => e.param === id);
}

export interface RevisionDiff {
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly relabelled: readonly string[];
}

export function diffRevisions(prev: Drawing | null, cur: Drawing): RevisionDiff {
  if (!prev) return { added: [], removed: [], relabelled: [] };
  const before = new Map(prev.params.map((p) => [p.id, p]));
  const after = new Map(cur.params.map((p) => [p.id, p]));
  return {
    added: cur.params.filter((p) => !before.has(p.id)).map((p) => p.id),
    removed: prev.params.filter((p) => !after.has(p.id)).map((p) => p.id),
    relabelled: cur.params.filter((p) => {
      const old = before.get(p.id);
      return old !== undefined && old.label !== p.label;
    }).map((p) => p.id),
  };
}

/** Plain-text summary (fallback for pasting into chat). */
export function summaryText(drawing: Drawing, m: Measurements): string {
  const lines = [`${drawing.title}, ${drawing.units} (чертёж rev ${drawing.revision}):`];
  for (const g of drawing.groups) {
    lines.push('', `[${g.title}]`);
    for (const p of drawing.params.filter((pp) => pp.group === g.id)) {
      lines.push(`${p.id} = ${m.values[p.id]?.value ?? '?'}   (${p.label})`);
    }
  }
  if (m.comment.trim()) lines.push('', `Комментарий: ${m.comment.trim()}`);
  return lines.join('\n');
}
