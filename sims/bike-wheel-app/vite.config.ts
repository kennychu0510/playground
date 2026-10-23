import { defineConfig } from 'vite'

// GitHub Pages: https://kennychu0510.github.io/playground/sims/bike-wheel/
export default defineConfig({
  base: '/playground/sims/bike-wheel/',
  build: {
    outDir: '../bike-wheel',
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    host: true,
  },
})
