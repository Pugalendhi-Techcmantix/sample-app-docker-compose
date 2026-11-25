import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { watchOptions } from './watch-options.js'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    server: { watch: watchOptions(), proxy: { '/api': env.API_PROXY_TARGET || 'http://localhost:4000' } },
    // VITE_API_URL is pinned so tests ignore any .env.local
    test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test-setup.js'], env: { VITE_API_URL: '/api' } },
  }
})
