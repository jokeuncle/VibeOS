import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api/nlp': {
        target: 'http://localhost:8040',
        changeOrigin: true,
      },
      '/api/agents/architecture': {
        target: 'http://localhost:8041',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/agents\/architecture/, '/api'),
      },
      '/api': {
        target: 'http://localhost:8010',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8020',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
