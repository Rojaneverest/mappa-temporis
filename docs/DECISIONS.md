# Decisions log

| # | Date | Decision | Why |
|---|---|---|---|
| 1 | 2026-10-23 | Interactive web first; print as a later edition | Deep zoom is the primary experience |
| 2 | 2026-10-23 | 3300 BCE → today, equidistant, plus a compressed Neolithic prologue; deep-time spiral later | UsefulCharts parity + origins |
| 3 | 2026-10-23 | Personal, non-commercial project: any openly viewable source allowed (incl. NC licenses, modern photos); credits kept, `rights` field stored | Rojan will not sell it |
| 4 | 2026-10-23 | Style: "Atlas Antiqua" first | Warm, UsefulCharts-like, museum craft |
| 5 | 2026-10-23 | Private/local until at least Phase 2 | — |
| 6 | 2026-10-23 | Claude drafts content; Rojan reviews | — |
| 7 | 2026-10-23 | English only for now (Wikidata IDs keep i18n possible) | — |
| 8 | 2026-10-23 | Working title: *Mappa Temporis* | — |
| 9 | 2026-10-23 | **Scale reduced:** ~12 units/year, ~70k × 32k canvas, ~80× zoom, 4 zoom levels | v1 scale would look clogged and be hard to manage |
| 10 | 2026-10-23 | **Calm by default:** prominence P1–P5; P4 drawn faint ("whisper"), P5 not drawn (Folio/search only); hard density budgets with auto-demotion; optional layers off by default | Less important history should be quiet or hidden |
| 11 | 2026-10-23 | Rendering: Skia (CanvasKit) tiles in workers; benchmark against native canvas in Phase 0 | Identical text metrics, effects, one renderer for screen/print/video |
| 12 | 2026-10-23 | Paper texture is composited by the viewer on the GPU; tiles are transparent ink | Skia-in-wasm paper cost 45 ms/tile; ink-only tiles render in ~2 ms |
| 13 | 2026-10-23 | Custom deep-zoom viewer for the chart; OpenSeadragon kept for IIIF doorways | Frozen HUD, tile fallback and paper compositing were simpler with our own camera |
