import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Skip our Node-only pipeline files when crawling src/ for Vite's HMR graph.
  optimizeDeps: { entries: ['index.html'] },
})
