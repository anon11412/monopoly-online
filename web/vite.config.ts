import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Use BACKEND_PROXY if provided (e.g., Docker Compose), else default to local host
    // Note: This env var is read by Node at config time and is not exposed to the client
    port: 5173,
    host: true,
    // Allow external tunnel hostnames (e.g., *.trycloudflare.com)
    allowedHosts: true,
    proxy: {
      // Resolve backend base
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - process.env available in Vite config (Node env)
      ...( (() => { const target = process.env.BACKEND_PROXY || 'http://127.0.0.1:8000'; return {
      '/socket.io': {
        target,
        ws: true,
        changeOrigin: true,
        rewrite: (path) => path, // keep as-is
      },
      '/board_meta': {
        target,
        changeOrigin: true,
      },
      '/trade': {
        target,
        changeOrigin: true,
      },
      '/healthz': {
        target,
        changeOrigin: true,
      },
      '/auth': {
        target,
        changeOrigin: true,
      },
      '/logout': {
        target,
        changeOrigin: true,
      },
      '/api': {
        target,
        changeOrigin: true,
      },
    }; })() ),
    },
  },
})
