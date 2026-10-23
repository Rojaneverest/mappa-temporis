# Phase 0a — renderer & viewer spike (2026-10-23)

## What exists

- **`packages/core`**: the date model (astronomical years, "c.", centuries, decades, spans, formatting, calendar-round ticks), with tests; the content schema (Zod) including prominence P1–P5; the pigment palette.
- **`content/`**: the first real content. Proof sheet I covers East Asia and the eastern steppe, 800 BCE – 700 CE: 37 lanes and 51 events, each with prominence, confidence and sources.
- **`scripts/build-chart.ts`**: validates and lints the content, lays it out (v0: columns pinned by hand), measures every text with Skia, and writes the display list (`apps/explorer/public/chart/*.json`).
- **`packages/render`**: the display-list types, the font registry, and the single `Painter` (Skia/CanvasKit) used by both the browser and Node.
- **`scripts/render-png.ts`**: the same painter in Node, writing PNGs. This is the seed of print/video export and handy for visual checks.
- **`apps/explorer`**: the deep-zoom viewer.
  - A custom camera with wheel/pinch/drag/inertia/keyboard controls.
  - A pool of 6 CanvasKit tile workers.
  - Fallback to a parent tile while a tile renders.
  - Paper composited on the GPU.
  - A frozen HUD: year ruler, region headers, cursor year, zoom level, and render stats (press D).

## Measurements (MacBook, Chrome-based preview pane, DPR 2, 512×512 device-px tiles)

| | Result | Budget |
|---|---|---|
| Tile render, median | **1.6–2.0 ms** | < 30 ms |
| Tile render, p95 (includes cold paragraph builds) | 36–55 ms | — |
| Display list for this sheet | 76 KB | — |
| CanvasKit wasm | 7.1 MB (uncompressed) | lazy |
| Fonts | **28 MB**, of which Noto Serif TC is 16 MB | ✗ must subset |
| Console errors | none | — |

## Decisions taken during the spike

1. **The paper is drawn by the viewer on the GPU, not by Skia.**
   - Paper noise evaluated per pixel in WebAssembly cost 2 s per screen, and baked textures still cost 45 ms per tile.
   - Tiles are now transparent "ink"; the browser lays the paper underneath and its texture on top.
   - The Node painter does the same in software, so PNG/print output matches the screen.
2. **Paper mottling fades in with zoom.** Zoomed out, a real sheet reads as an even tone. Zoomed in, the fibres show.
3. **Custom viewer instead of OpenSeadragon, for now.**
   - Owning the camera made the frozen ruler/headers, tile fallback and paper compositing simple.
   - OpenSeadragon remains the plan for the IIIF "doorways" (zooming into a museum's own scan).
4. **Calm by default works as designed.**
   - Prominence controls size, ink and a zoom-dependent fade-in.
   - At the wall view only P1/P2 structure shows. P4 "whisper" labels appear faint, in italic, at detail zoom.

## Known issues → next

- **Fonts:** subset Noto Serif TC (and the other CJK/historic-script fonts) at build time to the glyphs actually used (harfbuzz `hb-subset`). Target: under 2 MB total.
- **Layout v0 is hand-pinned.** Phase 0b adds the real engine:
  - lane ordering that minimizes crossings, and region columns that flow with the number of lanes
  - label placement on a collision grid
  - density budgets with automatic demotion (the build already demotes labels with no room; budgets per screen-window are still to do)
- **Composition is sparse:** lanes are thin relative to their columns, and nothing yet fills the space between them. Images (Phase 0c) and a column-width optimizer will change this a lot.
- **Not yet built:**
  - picking (hover/click an item → Folio)
  - frozen lane headers
  - minimap
  - URL deep links
- **Safari / iPad** not yet tested.
- **Turning-point bands:** the Axial Age is drawn as a band; it may read better as a caption only, with bands reserved for crises.
