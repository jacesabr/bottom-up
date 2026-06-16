import 'dotenv/config';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.VITE_PORT) || 5173,
    proxy: {
      '/api': {
        // Follows API_PORT (.env) so the web and API can't drift onto different ports.
        // VITE_API_PROXY still wins if you need to point dev at a remote/other API.
        target: process.env.VITE_API_PROXY || `http://localhost:${process.env.API_PORT || 3030}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist/web',
    target: 'ES2020',
  },
});
