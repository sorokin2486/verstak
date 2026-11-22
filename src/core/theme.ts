/** Drawing palette. The app is dark-only; the same palette is used for PNG previews. */
export interface Theme {
  readonly paper: string;
  readonly sheet: string;
  readonly ink: string;
  readonly muted: string;
  readonly line: string;
  readonly partFill: string;
  readonly pocketFill: string;
  readonly accent: string;
  readonly accentInk: string;
  readonly critical: string;
  readonly mono: string;
  readonly sans: string;
}

export const DARK: Theme = {
  paper: '#0F1318',
  sheet: '#161C23',
  ink: '#DCE3EA',
  muted: '#8D9AA8',
  line: '#2E3946',
  partFill: '#4A2236',
  pocketFill: '#64294A',
  accent: '#FF5AA5',
  accentInk: '#1A0B12',
  critical: '#FFB347',
  mono: "'Cascadia Mono', Consolas, monospace",
  sans: "'Segoe UI', system-ui, sans-serif",
};
