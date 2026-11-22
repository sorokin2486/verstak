/** Part screen: drawing + measurement form. Owns the in-memory Measurements and saves them to disk. */
import {
  acknowledgeRevision, approxWarning, diffRevisions, historyFor, logChange, progress, setComment,
  setStatus, setValue, summaryText,
} from '../core/measurements.ts';
import { loadPart, type LoadedPart } from '../core/part.ts';
import { renderView } from '../core/render.ts';
import { DARK } from '../core/theme.ts';
import type { Drawing, Measurements } from '../core/types.ts';
import { validateDrawing } from '../core/validate.ts';
import type { Backend } from './backend.ts';
import {
  bannerHtml, commentHtml, errorsHtml, formHtml, headerHtml, historyHtml, orphansHtml, sheetHtml,
} from './part-html.ts';

const SAVE_DELAY_MS = 400;

export interface PartViewHooks {
  /** Measurements changed in memory (sidebar progress). */
  readonly onChange: (name: string, m: Measurements) => void;
  readonly onError: (message: string) => void;
}

export interface PartView {
  readonly name: string;
  /** Re-read files from disk after an external change; keeps the screen when nothing relevant changed. */
  reload(): Promise<void>;
  /** Writes any pending change now. */
  flush(): Promise<void>;
}

/** One set of root listeners per container: mounting a new part drops the previous part's listeners. */
const listeners = new WeakMap<HTMLElement, AbortController>();

const nowIso = (): string => new Date().toISOString();

async function previousDrawing(backend: Backend, name: string, revision: number): Promise<Drawing | null> {
  const text = await backend.readRevision(name, revision);
  if (text === null) return null;
  try {
    return validateDrawing(JSON.parse(text)).drawing;
  } catch {
    return null;
  }
}

export async function mountPart(root: HTMLElement, backend: Backend, name: string, hooks: PartViewHooks): Promise<PartView> {
  let drawingText: string | null = null;
  let part: LoadedPart = loadPart(name, null, null);
  let m: Measurements = part.measurements;
  let active: string | null = null;
  let focusValue: string | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let lastWritten: string | null = null;

  listeners.get(root)?.abort();
  const controller = new AbortController();
  listeners.set(root, controller);
  const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void) => {
    root.addEventListener(type, fn, { signal: controller.signal });
  };

  const $ = <T extends Element>(sel: string): T | null => root.querySelector<T>(sel);
  const saveState = (text: string, isError = false) => {
    const el = $<HTMLElement>('#save-state');
    if (el) { el.textContent = text; el.classList.toggle('error', isError); }
  };

  let inflight: Promise<void> = Promise.resolve();
  const writeNow = async () => {
    const content = JSON.stringify(m, null, 2);
    if (content === lastWritten) return;
    if (part.measurementsError) {
      const msg = `measurements.json повреждён, сохранение остановлено, чтобы не затереть его. Исправь или переименуй файл. (${part.measurementsError})`;
      saveState('не сохранено', true);
      hooks.onError(msg);
      return;
    }
    try {
      await backend.writeMeasurements(name, content);
      lastWritten = content;
      saveState('сохранено');
    } catch (e) {
      const msg = `Не удалось сохранить замеры: ${String(e)}`;
      saveState(msg, true);
      hooks.onError(msg);
    }
  };
  /** Writes are chained, so flush() can wait for one that is already running. */
  const write = (): Promise<void> => {
    saveTimer = null;
    inflight = inflight.then(writeNow);
    return inflight;
  };
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveState('…');
    saveTimer = setTimeout(() => { void write(); }, SAVE_DELAY_MS);
  };
  const update = (next: Measurements) => {
    if (next === m) return;
    m = next;
    hooks.onChange(name, m);
    scheduleSave();
  };

  const drawViews = (d: Drawing) => {
    const values = Object.fromEntries(Object.entries(m.values).map(([k, v]) => [k, v.value]));
    for (const v of d.views) {
      const host = root.querySelector<HTMLElement>(`.view-host[data-view="${CSS.escape(v.id)}"]`);
      if (host) host.innerHTML = renderView(d, v, { values, active }, DARK);
    }
  };

  const syncRows = (d: Drawing) => {
    for (const p of d.params) {
      const row = root.querySelector<HTMLElement>(`#row-${p.id}`);
      if (!row) continue;
      const value = m.values[p.id]?.value;
      row.classList.toggle('filled', !!value);
      row.classList.toggle('on', active === p.id);
      const warn = row.querySelector<HTMLElement>('.warn');
      const text = approxWarning(p, value);
      if (warn) { warn.hidden = !text; warn.textContent = text ?? ''; }
      const hist = historyFor(m, p.id);
      const btn = row.querySelector<HTMLButtonElement>('.hist-btn');
      if (btn) { btn.hidden = hist.length === 0; btn.textContent = `история · ${hist.length}`; }
      const list = row.querySelector<HTMLElement>('.hist');
      if (list) list.innerHTML = historyHtml(hist);
    }
    const pr = progress(d, m);
    const progressEl = $<HTMLElement>('#progress');
    if (progressEl) progressEl.textContent = `заполнено ${pr.filled} из ${pr.total}`;
    const done = $<HTMLButtonElement>('#done-btn');
    if (done) {
      done.textContent = m.status === 'done' ? 'Готово ✓ · вернуть в работу' : 'Готово, передать Claude';
      done.classList.toggle('is-done', m.status === 'done');
      done.title = pr.missingRequired.length ? `Не заполнены: ${pr.missingRequired.join(', ')}` : '';
    }
  };

  const render = async () => {
    const d = part.drawing;
    if (!d) { root.innerHTML = errorsHtml(name, part.errors); return; }
    if (drawingText !== null) {
      backend.archiveRevision(name, d.revision, drawingText).catch((e) => hooks.onError(`История: ${String(e)}`));
    }
    let banner = '';
    let added = new Set<string>();
    if (part.previousRevision !== null) {
      const diff = diffRevisions(await previousDrawing(backend, name, part.previousRevision), d);
      added = new Set(diff.added);
      banner = bannerHtml(d, part.previousRevision, diff);
    }
    root.innerHTML = headerHtml(d) + banner + sheetHtml(d) +
      `<form class="form" autocomplete="off">${formHtml(d, m, added)}</form>` +
      orphansHtml(d, m) + commentHtml(d, m);
    drawViews(d);
    syncRows(d);
  };

  const load = async () => {
    const files = await backend.readPart(name);
    drawingText = files.drawing;
    lastWritten = files.measurements;
    part = loadPart(name, files.drawing, files.measurements);
    m = part.measurements;
    if (files.error) hooks.onError(files.error);
    if (part.measurementsError) hooks.onError(`${part.measurementsError}. Сохранение замеров отключено.`);
  };

  /* ---------- events (delegated on the root, so re-renders need no re-binding) ---------- */
  on('submit', (e) => e.preventDefault());
  on('input', (e) => {
    const t = e.target;
    const d = part.drawing;
    if (!d) return;
    if (t instanceof HTMLInputElement && t.dataset.k) {
      const next = setValue(m, t.dataset.k, t.value, d.revision, nowIso());
      const shown = next.values[t.dataset.k]?.value ?? '';
      if (shown !== t.value.trim()) t.value = shown;
      update(next);
      drawViews(d);
      syncRows(d);
    } else if (t instanceof HTMLTextAreaElement && t.id === 'comment') {
      update(setComment(m, t.value));
    }
  });
  on('focusin', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || !t.dataset.k || !part.drawing) return;
    active = t.dataset.k;
    focusValue = m.values[active]?.value ?? null;
    drawViews(part.drawing);
    syncRows(part.drawing);
  });
  on('focusout', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || !t.dataset.k || !part.drawing) return;
    const id = t.dataset.k;
    update(logChange(m, id, focusValue, m.values[id]?.value ?? null, nowIso()));
    active = null;
    drawViews(part.drawing);
    syncRows(part.drawing);
  });
  on('click', (e) => {
    const t = e.target as Element;
    const tag = t.closest('svg .dim');
    if (tag) {
      const input = root.querySelector<HTMLInputElement>(`#in-${CSS.escape(tag.getAttribute('data-k') ?? '')}`);
      input?.focus({ preventScroll: true });
      input?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    const hist = t.closest<HTMLElement>('[data-hist]');
    if (hist) {
      const list = root.querySelector<HTMLElement>(`#hist-${CSS.escape(hist.dataset.hist ?? '')}`);
      if (list) list.hidden = !list.hidden;
      return;
    }
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act) void runAction(act);
  });

  const runAction = async (act: string) => {
    const d = part.drawing;
    if (!d) return;
    if (act === 'done') {
      update(setStatus(m, m.status === 'done' ? 'in_progress' : 'done'));
      syncRows(d);
    } else if (act === 'ack') {
      update(acknowledgeRevision(m, d.revision));
      part = { ...part, previousRevision: null, measurements: m };
      await render();
    } else if (act === 'copy') {
      await navigator.clipboard.writeText(summaryText(d, m))
        .then(() => saveState('текст скопирован'), () => saveState('скопировать не вышло', true));
    } else if (act === 'open-folder') {
      backend.openPartFolder(name).catch((err) => hooks.onError(String(err)));
    }
  };

  await load();
  await render();

  /** Writes a pending (debounced) edit now and waits for any write in progress. */
  const flush = async () => {
    if (saveTimer) { clearTimeout(saveTimer); await write(); }
    await inflight;
  };

  return {
    name,
    flush,
    async reload() {
      // Save pending edits first: otherwise load() would replace them with the older copy on disk.
      await flush();
      const files = await backend.readPart(name);
      const drawingChanged = files.drawing !== drawingText;
      const measurementsChanged = files.measurements !== lastWritten;
      if (!drawingChanged && !measurementsChanged) return;
      const scrollTop = root.scrollTop;
      await load();
      await render();
      root.scrollTop = scrollTop;
    },
  };
}
