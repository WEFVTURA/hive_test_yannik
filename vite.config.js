import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: 'public',
  server: {
    port: 4700,
    open: true,
    proxy: {
      // API proxies removed for localhost dev to avoid 404s
    }
  }
});
