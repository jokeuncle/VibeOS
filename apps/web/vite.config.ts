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
      '/api/agents': {
        target: 'http://localhost:8040',
        changeOrigin: true,
        rewrite: (path) => {
          // /api/agents/{type}/chat/stream -> /api/chat/{type}/stream
          // /api/agents/{type}/chat -> /api/chat/{type}
          return path.replace(/^\/api\/agents\/([^/]+)\/chat(\/stream)?$/, '/api/chat/$1$2')
        },
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
