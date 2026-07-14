import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  server: {
    // 浏览器保持同源请求，开发代理将 Access JWT 原样转发给本地 Worker。
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/internal': 'http://127.0.0.1:8787',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
})
