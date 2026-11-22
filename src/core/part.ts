import { emptyMeasurements, parseMeasurements, progress } from './measurements.ts';
import type { Drawing, Measurements } from './types.ts';
import { validateDrawing } from './validate.ts';

export interface LoadedPart {
  readonly name: string;
  readonly drawing: Drawing | null;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly measurements: Measurements;
  /** Revision the user last acknowledged, when the drawing on disk is newer; otherwise null. */
  readonly previousRevision: number | null;
  /** measurements.json exists but is not valid JSON: saving must stay blocked so it is not overwritten. */
  readonly measurementsError: string | null;
}

function parseJson(text: string, what: string): { value: unknown; error: string | null } {
  try {
    return { value: JSON.parse(text), error: null };
  } catch (e) {
    return { value: null, error: `${what}: не читается как JSON — ${(e as Error).message}` };
  }
}

/** Turns the raw files of a part folder into a validated model. Never throws. */
export function loadPart(name: string, drawingText: string | null, measurementsText: string | null): LoadedPart {
  if (drawingText === null) {
    return {
      name, drawing: null, errors: ['Нет файла drawing.json'], warnings: [],
      measurements: emptyMeasurements(1), previousRevision: null, measurementsError: null,
    };
  }
  const parsed = parseJson(drawingText, 'drawing.json');
  const result = parsed.error === null ? validateDrawing(parsed.value) : null;
  const drawing = result?.drawing ?? null;
  const errors = parsed.error !== null ? [parsed.error] : [...(result?.errors ?? [])];
  const revision = drawing?.revision ?? 1;

  let measurements = emptyMeasurements(revision);
  let measurementsError: string | null = null;
  if (measurementsText !== null) {
    const m = parseJson(measurementsText, 'measurements.json');
    measurementsError = m.error;
    measurements = parseMeasurements(m.value, revision);
  }
  const previousRevision = drawing && measurements.drawingRevision < drawing.revision ? measurements.drawingRevision : null;
  return { name, drawing, errors, warnings: result?.warnings ?? [], measurements, previousRevision, measurementsError };
}

export type PartStatus = 'error' | 'updated' | 'done' | 'in_progress' | 'new';

export interface PartSummary {
  readonly name: string;
  readonly title: string;
  readonly status: PartStatus;
  readonly filled: number;
  readonly total: number;
  readonly revision: number | null;
}

export function summarize(part: LoadedPart): PartSummary {
  if (!part.drawing) {
    return { name: part.name, title: part.name, status: 'error', filled: 0, total: 0, revision: null };
  }
  const p = progress(part.drawing, part.measurements);
  const status: PartStatus = part.previousRevision !== null ? 'updated'
    : part.measurements.status === 'done' ? 'done'
      : p.filled === 0 ? 'new' : 'in_progress';
  return { name: part.name, title: part.drawing.title, status, filled: p.filled, total: p.total, revision: part.drawing.revision };
}

export const STATUS_LABEL: Readonly<Record<PartStatus, string>> = {
  error: 'ошибка в чертеже',
  updated: 'новая ревизия',
  done: 'готово',
  in_progress: 'замер',
  new: 'новый',
};
