/** App shell: library sidebar + the open part. */
import './styles.css';
import { esc } from '../core/escape.ts';
import { loadPart, STATUS_LABEL, summarize, type LoadedPart } from '../core/part.ts';
import type { Measurements } from '../core/types.ts';
import { isTauri, tauriBackend, type Backend } from './backend.ts';
import { mockBackend } from './mock-backend.ts';
import { mountPart, type PartView } from './part-view.ts';

const CHANGE_DEBOUNCE_MS = 250;
const TOAST_MS = 6000;
const LAST_PART_KEY = 'verstak-last-part';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('#app missing');

app.innerHTML = `
  <aside class="sidebar">
    <div class="brand"><span class="logo" aria-hidden="true"></span><b>Верстак</b></div>
    <div class="lib">
      <span class="lib-label">Библиотека</span>
      <code class="lib-path" id="lib-path"></code>
      <div class="lib-actions">
        <button type="button" class="ghost small" id="lib-change">Сменить</button>
        <button type="button" class="ghost small" id="lib-refresh">Обновить</button>
      </div>
      <form class="lib-form" id="lib-form" hidden>
        <input id="lib-input" spellcheck="false" aria-label="Путь к библиотеке">
        <button type="submit" class="small">OK</button>
      </form>
    </div>
    <nav class="parts" id="parts" aria-label="Детали"></nav>
  </aside>
  <main class="main" id="main"></main>
  <div class="toast" id="toast" role="alert" hidden></div>`;

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} missing`);
  return node as T;
};
const partsEl = el('parts');
const mainEl = el('main');
const toastEl = el('toast');

let toastTimer: ReturnType<typeof setTimeout> | null = null;
function toast(message: string): void {
  toastEl.textContent = message;
  toastEl.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, TOAST_MS);
}

function readLastPart(): string | null {
  try { return localStorage.getItem(LAST_PART_KEY); } catch { return null; }
}
function rememberPart(name: string): void {
  try { localStorage.setItem(LAST_PART_KEY, name); } catch { /* convenience only */ }
}

/** Same part with in-memory measurements; recomputes whether a revision is still unacknowledged. */
function withMeasurements(p: LoadedPart, m: Measurements): LoadedPart {
  const previousRevision = p.drawing && m.drawingRevision < p.drawing.revision ? m.drawingRevision : null;
  return { ...p, measurements: m, previousRevision };
}

async function start(backend: Backend): Promise<void> {
  let parts: LoadedPart[] = [];
  let current: PartView | null = null;

  const renderList = () => {
    if (parts.length === 0) {
      partsEl.innerHTML = '<p class="empty">Деталей пока нет. Claude кладёт каждую деталь в свою подпапку библиотеки с файлом <code>drawing.json</code>.</p>';
      return;
    }
    partsEl.innerHTML = parts.map(summarize).map((s) => `
      <button type="button" class="part-item${current?.name === s.name ? ' active' : ''}" data-part="${esc(s.name)}">
        <span class="part-title">${esc(s.title)}</span>
        <span class="part-meta"><span class="st st-${s.status}">${STATUS_LABEL[s.status]}</span>
        ${s.total ? `<span class="count">${s.filled}/${s.total}</span>` : ''}${s.revision ? `<span class="rev">r${s.revision}</span>` : ''}</span>
      </button>`).join('');
  };

  const refreshList = async () => {
    try {
      const files = await backend.listParts();
      parts = files.map((f) => loadPart(f.name, f.drawing, f.measurements));
    } catch (e) {
      toast(String(e));
    }
    renderList();
  };

  const onChange = (name: string, m: Measurements) => {
    parts = parts.map((p) => (p.name === name ? withMeasurements(p, m) : p));
    renderList();
  };

  const open = async (name: string) => {
    await current?.flush();
    mainEl.scrollTop = 0;
    try {
      current = await mountPart(mainEl, backend, name, { onChange, onError: toast });
      rememberPart(name);
    } catch (e) {
      current = null;
      mainEl.innerHTML = `<p class="empty">Не удалось открыть «${esc(name)}»: ${esc(String(e))}</p>`;
    }
    renderList();
  };

  const showWelcome = (root: string) => {
    mainEl.innerHTML = `<div class="welcome"><h1>Библиотека пуста</h1>
      <p>Попроси Claude сделать чертёж под замер. Он положит папку детали в <code>${esc(root)}</code>, и она появится здесь сама.</p></div>`;
  };

  partsEl.addEventListener('click', (e) => {
    const name = (e.target as Element).closest<HTMLElement>('[data-part]')?.dataset.part;
    if (name && name !== current?.name) void open(name);
  });

  const settings = await backend.getSettings();
  const pathEl = el('lib-path');
  pathEl.textContent = settings.libraryRoot;
  const form = el<HTMLFormElement>('lib-form');
  const input = el<HTMLInputElement>('lib-input');
  el('lib-change').addEventListener('click', () => {
    form.hidden = !form.hidden;
    input.value = pathEl.textContent ?? '';
    if (!form.hidden) input.focus();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await current?.flush();
      const next = await backend.setLibraryRoot(input.value);
      pathEl.textContent = next.libraryRoot;
      form.hidden = true;
      current = null;
      await refreshList();
      const first = parts[0];
      if (first) await open(first.name);
      else showWelcome(next.libraryRoot);
    } catch (err) {
      toast(String(err));
    }
  });
  el('lib-refresh').addEventListener('click', async () => {
    await refreshList();
    await current?.reload().catch((err) => toast(String(err)));
  });

  // File events arrive in bursts (temp file + rename); coalesce them.
  let pending = new Set<string>();
  let changeTimer: ReturnType<typeof setTimeout> | null = null;
  await backend.onLibraryChanged((names) => {
    pending = new Set([...pending, ...names]);
    if (changeTimer) clearTimeout(changeTimer);
    changeTimer = setTimeout(async () => {
      const changed = pending;
      pending = new Set();
      await refreshList();
      if (current && changed.has(current.name)) await current.reload().catch((err) => toast(String(err)));
      else if (!current && parts[0]) await open(parts[0].name);
    }, CHANGE_DEBOUNCE_MS);
  });

  await refreshList();
  const last = readLastPart();
  const first = parts.find((p) => p.name === last) ?? parts[0];
  if (first) await open(first.name);
  else showWelcome(settings.libraryRoot);

  await backend.onBeforeClose(async () => {
    await current?.flush().catch((e) => toast(String(e)));
  });
}

const backend = isTauri() ? await tauriBackend() : mockBackend();
start(backend).catch((e) => toast(`Ошибка запуска: ${String(e)}`));
