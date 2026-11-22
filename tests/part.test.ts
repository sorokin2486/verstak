import { describe, expect, it } from 'vitest';
import { loadPart, summarize } from '../src/core/part.ts';
import { minimal } from './fixtures.ts';

const drawingText = (patch: Record<string, unknown> = {}) => JSON.stringify({ ...minimal(), ...patch });

describe('loadPart', () => {
  it('reports a missing drawing', () => {
    const p = loadPart('x', null, null);
    expect(p.drawing).toBeNull();
    expect(p.errors).toEqual(['Нет файла drawing.json']);
    expect(summarize(p).status).toBe('error');
  });

  it('reports broken JSON and invalid drawings', () => {
    expect(loadPart('x', '{oops', null).errors[0]).toMatch(/не читается как JSON/);
    expect(loadPart('x', drawingText({ format: 'x' }), null).errors[0]).toMatch(/format/);
  });

  it('starts new measurements at the drawing revision', () => {
    const p = loadPart('plate', drawingText({ revision: 3 }), null);
    expect(p.measurements.drawingRevision).toBe(3);
    expect(p.previousRevision).toBeNull();
    expect(summarize(p)).toEqual({ name: 'plate', title: 'Пластина', status: 'new', filled: 0, total: 2, revision: 3 });
  });

  it('flags a revision the user has not acknowledged yet', () => {
    const m = JSON.stringify({ drawingRevision: 1, values: { A: { value: '50' } } });
    const p = loadPart('plate', drawingText({ revision: 2 }), m);
    expect(p.previousRevision).toBe(1);
    expect(summarize(p).status).toBe('updated');
  });

  it('summarises progress and done status', () => {
    const inProgress = JSON.stringify({ drawingRevision: 1, values: { A: { value: '50' } } });
    expect(summarize(loadPart('p', drawingText(), inProgress))).toMatchObject({ status: 'in_progress', filled: 1 });
    const done = JSON.stringify({ drawingRevision: 1, status: 'done', values: {} });
    expect(summarize(loadPart('p', drawingText(), done)).status).toBe('done');
    expect(loadPart('p', drawingText(), '{bad').measurements.values).toEqual({});
  });

  it('marks corrupt measurements so the app does not overwrite them', () => {
    expect(loadPart('p', drawingText(), '{bad').measurementsError).toMatch(/measurements\.json/);
    expect(loadPart('p', drawingText(), '{}').measurementsError).toBeNull();
    expect(loadPart('p', drawingText(), null).measurementsError).toBeNull();
  });
});
