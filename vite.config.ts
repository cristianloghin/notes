import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Take the assigned port so this can share a machine with other
    // projects' dev servers; falls back to Vite's own default when unset.
    port: Number(process.env.PORT) || undefined,
  },
});
