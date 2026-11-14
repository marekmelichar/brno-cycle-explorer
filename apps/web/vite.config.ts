import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, r('../..'), '');
  const apiTarget = env.VITE_API_PROXY_TARGET || `http://localhost:${env.API_PORT || 3001}`;
  return {
    plugins: [react()],
    envDir: r('../..'),
    resolve: {
      alias: {
        '@bce/shared': r('../../packages/shared/src/index.ts'),
        '@bce/geo': r('../../packages/geo/src/index.ts'),
      },
    },
    server: {
      port: Number(env.WEB_PORT || 5173),
      strictPort: true,
      host: true,
      proxy: { '/api': { target: apiTarget, changeOrigin: true } },
    },
    preview: { port: 4173, proxy: { '/api': { target: apiTarget, changeOrigin: true } } },
    build: {
      sourcemap: true,
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: {
          manualChunks: {
            maplibre: ['maplibre-gl'],
            mui: ['@mui/material', '@emotion/react', '@emotion/styled'],
            charts: ['recharts'],
          },
        },
      },
    },
  };
});
