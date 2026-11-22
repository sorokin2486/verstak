/**
 * Verstak file formats.
 *
 * drawing.json      — written only by Claude (format "verstak/1").
 * measurements.json — written only by the app (format "verstak-measurements/1").
 *
 * Geometry (views → shapes, dims) is separate from meaning (params):
 * a dimension on a view references a param by id, and one param may be
 * shown on several views. Coordinates are view units with Y pointing down (SVG).
 */

export const DRAWING_FORMAT = 'verstak/1';
export const MEASUREMENTS_FORMAT = 'verstak-measurements/1';

export type Point = readonly [number, number];

export type ShapeStyle = 'part' | 'hidden' | 'section' | 'center' | 'thin';
export const SHAPE_STYLES: readonly ShapeStyle[] = ['part', 'hidden', 'section', 'center', 'thin'];

export type Shape =
  | { readonly type: 'path'; readonly d: string; readonly style?: ShapeStyle }
  | { readonly type: 'rect'; readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly rx?: number; readonly style?: ShapeStyle }
  | { readonly type: 'circle'; readonly cx: number; readonly cy: number; readonly r: number; readonly style?: ShapeStyle }
  | { readonly type: 'line'; readonly from: Point; readonly to: Point; readonly style?: ShapeStyle }
  | { readonly type: 'polyline'; readonly points: readonly Point[]; readonly closed?: boolean; readonly style?: ShapeStyle }
  | { readonly type: 'text'; readonly at: Point; readonly text: string; readonly size?: number; readonly anchor?: 'start' | 'middle' | 'end' };

/** Extension line origins: the coordinate of the measured feature, or null for none. */
export type ExtPair = readonly [number | null, number | null];

export type Dim =
  /** Horizontal dimension between x[0] and x[1], drawn at height y. ext = feature y for each extension line. */
  | { readonly type: 'hdim'; readonly param: string; readonly x: readonly [number, number]; readonly y: number; readonly ext?: ExtPair }
  /** Vertical dimension between y[0] and y[1], drawn at x. ext = feature x for each extension line. */
  | { readonly type: 'vdim'; readonly param: string; readonly y: readonly [number, number]; readonly x: number; readonly ext?: ExtPair }
  /** Leader: dot on the feature at `at`, label placed at `label`. */
  | { readonly type: 'leader'; readonly param: string; readonly at: Point; readonly label: Point };

export type DimType = Dim['type'];

export interface View {
  readonly id: string;
  readonly title: string;
  /** SVG viewBox: [minX, minY, width, height]. */
  readonly box: readonly [number, number, number, number];
  readonly shapes: readonly Shape[];
  readonly dims: readonly Dim[];
}

export type ParamKind = 'length' | 'diameter' | 'radius' | 'angle' | 'count';
export const PARAM_KINDS: readonly ParamKind[] = ['length', 'diameter', 'radius', 'angle', 'count'];

export interface Param {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  readonly kind?: ParamKind;
  /** Critical for fit: shown with an accent, measure to 0.1 mm. */
  readonly critical?: boolean;
  /** Claude's estimate from the photo; used to warn about typos (mm vs cm). */
  readonly approx?: number;
  readonly hint?: string;
  readonly optional?: boolean;
}

export interface Group {
  readonly id: string;
  readonly title: string;
  readonly note?: string;
  readonly critical?: boolean;
}

export interface Drawing {
  readonly format: typeof DRAWING_FORMAT;
  readonly id: string;
  readonly title: string;
  readonly revision: number;
  readonly units: string;
  readonly scale?: string;
  readonly intro?: string;
  readonly steps?: readonly string[];
  /** Extra title-block rows, e.g. {"Кол-во": "2 шт."}. */
  readonly stamp?: Readonly<Record<string, string>>;
  /** Legend labels per shape style; styles without a label are not listed. */
  readonly legend?: Readonly<Partial<Record<ShapeStyle, string>>>;
  readonly commentHint?: string;
  /** What changed in this revision, in plain words (shown to the user). */
  readonly changes?: string;
  readonly groups: readonly Group[];
  readonly params: readonly Param[];
  readonly views: readonly View[];
}

export interface MeasuredValue {
  /** As typed by the user, normalised ("55.2", "40/38"). */
  readonly value: string;
  readonly updated: string;
  readonly drawingRevision: number;
}

export interface LogEntry {
  readonly at: string;
  readonly param: string;
  readonly from: string | null;
  readonly to: string | null;
}

export type MeasurementStatus = 'in_progress' | 'done';

export interface Measurements {
  readonly format: typeof MEASUREMENTS_FORMAT;
  /** Latest drawing revision the user has acknowledged. */
  readonly drawingRevision: number;
  readonly status: MeasurementStatus;
  readonly comment: string;
  readonly values: Readonly<Record<string, MeasuredValue>>;
  readonly log: readonly LogEntry[];
}
