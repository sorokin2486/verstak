import { describe, expect, it } from 'vitest';
import {
  acknowledgeRevision, approxWarning, diffRevisions, emptyMeasurements, historyFor, logChange,
  normalizeInput, orphanValues, parseMeasurements, parseNumber, progress, setComment, setStatus,
  setValue, summaryText,
} from '../src/core/measurements.ts';
import { minimal } from './fixtures.ts';

const NOW = '2026-11-22T10:00:00.000Z';

describe('input parsing', () => {
  it('normalises commas and strips junk', () => {
    expect(normalizeInput('55,2 мм')).toBe('55.2 ');
    expect(normalizeInput('40/38')).toBe('40/38');
    expect(normalizeInput('1234567890123456789')).toHaveLength(16);
  });

  it('parses the first number', () => {
    expect(parseNumber('40/38')).toBe(40);
    expect(parseNumber('-3.5')).toBe(-3.5);
    expect(parseNumber('/')).toBeNull();
  });
});

describe('editing is immutable', () => {
  it('sets and clears values without touching the original', () => {
    const m0 = setStatus(emptyMeasurements(1), 'done');
    const m1 = setValue(m0, 'A', '55,2', 1, NOW);
    expect(m0.values).toEqual({});
    expect(m1.values.A).toEqual({ value: '55.2', updated: NOW, drawingRevision: 1 });
    expect(m1.status).toBe('in_progress');
    expect(setValue(m1, 'A', '  ', 1, NOW).values.A).toBeUndefined();
  });

  it('logs only real changes', () => {
    const m = emptyMeasurements(1);
    expect(logChange(m, 'A', null, '', NOW)).toBe(m);
    const m2 = logChange(logChange(m, 'A', null, '50', NOW), 'A', '50', '51', NOW);
    expect(historyFor(m2, 'A').map((e) => e.to)).toEqual(['50', '51']);
    expect(m.log).toEqual([]);
  });

  it('sets comment, status and acknowledged revision', () => {
    const m = acknowledgeRevision(setComment(setStatus(emptyMeasurements(1), 'done'), 'ok'), 3);
    expect(m).toMatchObject({ comment: 'ok', status: 'done', drawingRevision: 3 });
  });
});

describe('parseMeasurements', () => {
  it('returns empty measurements for garbage', () => {
    expect(parseMeasurements('nope', 2)).toEqual(emptyMeasurements(2));
  });

  it('keeps valid entries and drops broken ones', () => {
    const m = parseMeasurements({
      drawingRevision: 2,
      status: 'done',
      comment: 'c',
      values: { A: { value: '5', updated: NOW, drawingRevision: 1 }, B: { value: 7 }, C: { value: '' }, E: { value: '3' } },
      log: [{ at: NOW, param: 'A', from: null, to: '5' }, { bad: true }],
    }, 9);
    expect(Object.keys(m.values)).toEqual(['A', 'E']);
    expect(m.values.E).toEqual({ value: '3', updated: '', drawingRevision: 9 });
    expect(m.log).toHaveLength(1);
    expect(m).toMatchObject({ drawingRevision: 2, status: 'done', comment: 'c' });
  });

  it('ignores prototype keys in values', () => {
    const raw = JSON.parse('{"values": {"__proto__": {"value": "1"}, "toString": {"value": "2"}, "A": {"value": "3"}}}');
    expect(Object.keys(parseMeasurements(raw, 1).values)).toEqual(['A']);
  });

  it('falls back on missing fields', () => {
    expect(parseMeasurements({ values: [], log: 'x' }, 4)).toEqual(emptyMeasurements(4));
  });
});

describe('progress and checks', () => {
  it('counts filled and missing required params', () => {
    const d = minimal();
    const m = setValue(emptyMeasurements(1), 'A', '50', 1, NOW);
    expect(progress(d, m)).toEqual({ filled: 1, total: 2, missingRequired: ['D'] });
  });

  it('warns when a value is far from the estimate', () => {
    const p = minimal().params[0];
    expect(approxWarning(p, '55')).toBeNull();
    expect(approxWarning(p, '5.5')).toMatch(/около 50/);
    expect(approxWarning(p, '550')).toMatch(/мм и см/);
    expect(approxWarning(p, undefined)).toBeNull();
    expect(approxWarning(minimal().params[1], '1')).toBeNull();
  });

  it('finds values orphaned by a new revision', () => {
    const m = setValue(setValue(emptyMeasurements(1), 'A', '1', 1, NOW), 'OLD', '2', 1, NOW);
    expect(orphanValues(minimal(), m).map(([id]) => id)).toEqual(['OLD']);
  });

  it('diffs params between revisions', () => {
    const prev = minimal();
    const cur = {
      ...prev,
      revision: 2,
      params: [{ ...prev.params[0], label: 'Длина пластины' }, { id: 'B', label: 'Ширина', group: 'g' }],
    };
    expect(diffRevisions(prev, cur)).toEqual({ added: ['B'], removed: ['D'], relabelled: ['A'] });
    expect(diffRevisions(null, cur)).toEqual({ added: [], removed: [], relabelled: [] });
  });

  it('builds a plain-text summary', () => {
    const m = setComment(setValue(emptyMeasurements(1), 'A', '50', 1, NOW), ' PETG ');
    const text = summaryText(minimal(), m);
    expect(text).toContain('A = 50   (Длина)');
    expect(text).toContain('D = ?');
    expect(text).toContain('Комментарий: PETG');
  });
});
