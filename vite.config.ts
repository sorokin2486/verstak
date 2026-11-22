import { defineConfig } from 'vitest/config';

// Tauri expects a fixed dev port and a relative build output.
export default defineConfig({
  clearScreen: false,
  server: { host: '127.0.0.1', port: 1420, strictPort: true },
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true },
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: { include: ['src/core/**'], reporter: ['text'] },
  },
});
