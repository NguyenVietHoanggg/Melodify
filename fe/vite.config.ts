import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      // API types live in the backend; the UI imports them with `import type` only (erased at build time).
      '@contracts': path.resolve(import.meta.dirname, '../be/src/contracts'),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // Libraries (React, Radix, Router…) change far less often than our own code: in their own chunk they
        // stay in the browser cache across releases, and the app chunk stays small.
        codeSplitting: {
          groups: [
            { name: 'react', test: /[\\/]node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/, priority: 2 },
            { name: 'vendor', test: /[\\/]node_modules[\\/]/, priority: 1 },
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    // Same-origin in development: the browser talks to :5173 only, Vite forwards /api (and the WebSocket)
    // to the backend. Cookies "just work" and no CORS setup is needed.
    proxy: {
      '/api': { target: process.env.VITE_DEV_API ?? 'http://localhost:4000', ws: true },
    },
  },
});
