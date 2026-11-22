import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Accepts a part folder or a drawing.json path; returns the drawing path. */
export function drawingPath(arg: string): string {
  return existsSync(arg) && statSync(arg).isDirectory() ? join(arg, 'drawing.json') : arg;
}

export function readJson(path: string): unknown {
  // Strip a UTF-8 BOM: PowerShell and some editors add one.
  return JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, ''));
}
