import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5317,
    // The explorer imports shared code straight from packages/.
    fs: { allow: ['../..'] },
  },
  worker: { format: 'es' },
  optimizeDeps: { include: ['canvaskit-wasm', 'flatbush'] },
});
