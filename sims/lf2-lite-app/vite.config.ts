import { defineConfig } from 'vite'

// GitHub Pages: https://kennychu0510.github.io/playground/sims/lf2-lite/
export default defineConfig({
  base: '/playground/sims/lf2-lite/',
  build: {
    outDir: '../lf2-lite',
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    port: 5176,
    host: true,
  },
})
