import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  appType: 'spa',
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api/conversation': {
        target: 'http://localhost:8040',
        changeOrigin: true,
      },
      '/api/feedback': {
        target: 'http://localhost:8040',
        changeOrigin: true,
      },
      '/api/graph': {
        target: 'http://localhost:8040',
        changeOrigin: true,
      },
      '/api/capabilities': {
        target: 'http://localhost:8040',
        changeOrigin: true,
      },
      '/api/workflow/approve': {
        target: 'http://localhost:8040',
        changeOrigin: true,
      },
      '/api/workflow/run-requirement': {
        target: 'http://localhost:8040',
        changeOrigin: true,
      },
      '/api/workflow/run-project': {
        target: 'http://localhost:8040',
        changeOrigin: true,
      },
      // Platform services (workspace-scoped UIs; avoid clashing with workspace-svc `/api/*`)
      '/svc/llm': {
        target: 'http://localhost:8030',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/svc\/llm/, ''),
      },
      '/svc/memory': {
        target: 'http://localhost:8050',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/svc\/memory/, ''),
      },
      '/svc/rag': {
        target: 'http://localhost:8060',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/svc\/rag/, ''),
      },
      '/svc/knowledge': {
        target: 'http://localhost:8070',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/svc\/knowledge/, ''),
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
