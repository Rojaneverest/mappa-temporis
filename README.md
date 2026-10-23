# Mappa Temporis

A deep-zoom atlas of world history — see [docs/PLAN.md](docs/PLAN.md).

```bash
pnpm install
pnpm build:tools  # compile the Apple Vision cut-out tool (macOS)
pnpm images       # fetch, cut out and size the images named in content/
pnpm dev          # builds the chart and opens the explorer on http://localhost:5317
pnpm test         # unit tests
node scripts/render-png.ts out.png 0.06   # render the sheet to PNG with the same painter
```
