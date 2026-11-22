/** Contract between the UI and the Rust side (src-tauri/src/main.rs). */

export interface PartFiles {
  readonly name: string;
  readonly drawing: string | null;
  readonly measurements: string | null;
  readonly error: string | null;
}

export interface Settings {
  readonly libraryRoot: string;
}

export interface Backend {
  getSettings(): Promise<Settings>;
  setLibraryRoot(path: string): Promise<Settings>;
  listParts(): Promise<PartFiles[]>;
  readPart(name: string): Promise<PartFiles>;
  writeMeasurements(name: string, content: string): Promise<void>;
  archiveRevision(name: string, revision: number, content: string): Promise<boolean>;
  readRevision(name: string, revision: number): Promise<string | null>;
  openPartFolder(name: string): Promise<void>;
  /** Called with part folder names whenever files under the library change. */
  onLibraryChanged(cb: (parts: readonly string[]) => void): Promise<void>;
  /** Runs (and awaits) cb before the window closes. */
  onBeforeClose(cb: () => Promise<void>): Promise<void>;
}

export const isTauri = (): boolean => '__TAURI_INTERNALS__' in window;

export async function tauriBackend(): Promise<Backend> {
  const { invoke } = await import('@tauri-apps/api/core');
  const { listen } = await import('@tauri-apps/api/event');
  return {
    getSettings: () => invoke('get_settings'),
    setLibraryRoot: (path) => invoke('set_library_root', { path }),
    listParts: () => invoke('list_parts'),
    readPart: (name) => invoke('read_part', { name }),
    writeMeasurements: (name, content) => invoke('write_measurements', { name, content }),
    archiveRevision: (name, revision, content) => invoke('archive_revision', { name, revision, content }),
    readRevision: (name, revision) => invoke('read_revision', { name, revision }),
    openPartFolder: (name) => invoke('open_part_folder', { name }),
    onLibraryChanged: async (cb) => {
      await listen<string[]>('library-changed', (e) => cb(e.payload));
    },
    onBeforeClose: async (cb) => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().onCloseRequested(async () => { await cb(); });
    },
  };
}
