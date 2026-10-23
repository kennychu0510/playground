import { defineConfig } from 'vite'

// GitHub Pages: https://kennychu0510.github.io/playground/sims/basketball-machine/
export default defineConfig({
  base: '/playground/sims/basketball-machine/',
  build: {
    outDir: '../basketball-machine',
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    port: 5175,
    host: true,
  },
})
