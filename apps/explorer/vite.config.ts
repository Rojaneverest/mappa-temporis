import { defineConfig } from 'vite';

// BASE_PATH is set by the GitHub Pages workflow ("/mappa-temporis/"); locally the site lives at "/".
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  build: { target: 'es2022' },
  server: {
    port: 5317,
    // The explorer imports shared code straight from packages/.
    fs: { allow: ['../..'] },
  },
  worker: { format: 'es' },
  optimizeDeps: { include: ['canvaskit-wasm', 'flatbush'] },
});
