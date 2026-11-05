import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  server: {
    // 本地 API 由 `wrangler pages dev` 提供（默认 8788），Vite 只负责前端
    proxy: { '/api': 'http://127.0.0.1:8788' },
  },
  plugins: [react()],
});
