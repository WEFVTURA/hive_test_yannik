import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: 'public',
  server: {
    port: 4700,
    open: true,
    proxy: {
      '/api/pplx-proxy': { target: 'http://localhost:4700', changeOrigin: true },
      '/api/pplx-research': { target: 'http://localhost:4700', changeOrigin: true }
    }
  }
});
