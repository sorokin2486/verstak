/**
 * In-browser stand-in for the Rust side, used only when the UI runs outside Tauri
 * (plain `npm run dev` in a browser). Seeded with the bundled example; changes live in localStorage.
 */
import easel from '../../examples/easel-bracket/drawing.json?raw';
import type { Backend, PartFiles } from './backend.ts';

const KEY = 'verstak-mock-v1';

interface MockState {
  parts: Record<string, { drawing: string; measurements: string | null; history: Record<number, string> }>;
}

function load(): MockState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as MockState;
  } catch {
    // storage unavailable or corrupt: start from the seed
  }
  return { parts: { 'easel-bracket': { drawing: easel, measurements: null, history: {} } } };
}

export function mockBackend(): Backend {
  let state = load();
  const persist = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* demo only */ }
  };
  const files = (name: string): PartFiles => {
    const p = state.parts[name];
    if (!p) throw new Error(`Нет детали ${name}`);
    return { name, drawing: p.drawing, measurements: p.measurements, error: null };
  };
  const update = (name: string, patch: (p: MockState['parts'][string]) => MockState['parts'][string]) => {
    const p = state.parts[name];
    if (!p) throw new Error(`Нет детали ${name}`);
    state = { parts: { ...state.parts, [name]: patch(p) } };
    persist();
  };
  return {
    getSettings: async () => ({ libraryRoot: 'браузер (демо)' }),
    setLibraryRoot: async () => { throw new Error('В браузерном демо папку сменить нельзя'); },
    listParts: async () => Object.keys(state.parts).map(files),
    readPart: async (name) => files(name),
    writeMeasurements: async (name, content) => update(name, (p) => ({ ...p, measurements: content })),
    archiveRevision: async (name, revision, content) => {
      if (state.parts[name]?.history[revision]) return false;
      update(name, (p) => ({ ...p, history: { ...p.history, [revision]: content } }));
      return true;
    },
    readRevision: async (name, revision) => state.parts[name]?.history[revision] ?? null,
    openPartFolder: async () => undefined,
    onLibraryChanged: async () => undefined,
    onBeforeClose: async (cb) => {
      window.addEventListener('beforeunload', () => { void cb(); });
    },
  };
}
