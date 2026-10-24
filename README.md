# Mappa Temporis

A deep-zoom atlas of world history — see [docs/PLAN.md](docs/PLAN.md).

**Live:** https://rojaneverest.github.io/mappa-temporis/ — rebuilt by GitHub Actions on every push to `main` (`.github/workflows/pages.yml`).

```bash
pnpm install
pnpm build:tools  # compile the Apple Vision cut-out tool (macOS)
pnpm images       # fetch, cut out and size the images named in content/
pnpm atlas        # build Atlas borders (needs Cliopatria in .cache/datasets, see docs/phase-1)
pnpm dev          # builds the chart and opens the explorer on http://localhost:5317
pnpm test         # unit tests
pnpm coverage     # coverage audit: events per era × region, people, voices, duplicates
node scripts/render-png.ts out.png 0.06   # render the sheet to PNG with the same painter
```
