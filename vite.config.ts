import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Serves and builds the demo only. The library itself is built by tsup
// (tsup.config.ts) into dist/, which is what the npm package ships.
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'demo-dist' },
  server: {
    // Take the assigned port so this can share a machine with other
    // projects' dev servers; falls back to Vite's own default when unset.
    port: Number(process.env.PORT) || undefined,
  },
});
