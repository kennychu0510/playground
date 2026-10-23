import { defineConfig } from 'vite'

// GitHub Pages: https://kennychu0510.github.io/playground/sims/squash/
export default defineConfig({
  base: '/playground/sims/squash/',
  build: {
    outDir: '../squash',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    host: true,
  },
})
