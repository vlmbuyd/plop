import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

import { SERVER_PORT } from './src/shared/config.ts';

export default defineConfig({
  root: 'src/client',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': `http://127.0.0.1:${SERVER_PORT}`,
    },
  },
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
});
