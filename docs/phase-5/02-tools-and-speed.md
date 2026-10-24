# Phase 5 — back to 10,000 BCE, tools behind a compass rose, smoother panning (2026-10-24)

Decisions 53–55.

## Deep time
Rojan tried the 3300 BCE default and found it made little difference. The world sheet starts at 10,000 BCE again. `world-deep.yaml`, the fold pill, the Layers → Time toggle and the sheet `extends`/`fold`/`atlas` fields are removed.

## Tools
- The toolbar (Layers, Lenses, Threads, Meanwhile, Atlas, Search) folds behind a **compass rose** in the top-left corner of the frame, where the year ruler meets the region headers.
  - The header row is now 44 px, so the rose sits in frame space, not on the chart.
- Click the rose, or press `.`, to unfold the tools: they slide out beside it, and the rose turns 45°.
  - The tools are folded by default, and the choice is remembered.
  - Every shortcut (L, K, T, Y, A, ⌘K, /) still works while folded. Menus opened that way sit where the toolbar would be.
  - The active-lens chip still shows, and a small dot on the rose (in the lens colour, or cinnabar for a thread) says a lens or thread is on.
- The rose is inline SVG drawn for this project: a 32-tick ring, eight two-tone points and a cinnabar north. It turns slightly on hover and respects reduced motion.

## Speed
Measured in the dev server by driving the viewer frame by frame and watching `longtask` entries, because the browser pane throttles animation frames while it's hidden:

| | Before | After |
|---|---|---|
| Panning down through several eras | long tasks of 123–695 ms (8 in 3 s) | none; worst main-thread gap 7 ms |
| Zooming in and out while panning | — | none; worst gap 35 ms |
| One Atlas redraw per year change | ~8 ms on the main thread | in a worker |
| Tile render (512² at 2×) | 4–9 ms paint, ≤ 22 ms pictures | unchanged (it was never the problem) |

- **The cause was the Atlas.**
  - Each time the year under the cursor crossed into a new era, the main thread fetched, converted and sorted that era's borders (feature conversion plus a projected-area sort of ~1,000 polities).
  - Every year change then redrew the whole map.
- **The fix** is `atlas-worker.ts`. It owns an OffscreenCanvas and does the loading, sorting and drawing there:
  - sphere, graticule and land are drawn once and reused;
  - updates arriving while it's busy are merged into one redraw;
  - the next and previous eras are preloaded;
  - pointer hover is forwarded at most once a frame.

  The main thread only sends the year and focus when they change, and shows the caption.
- **Smaller changes:**
  - Highlight boxes for the hover and selection are cached per zoom step, instead of scanning ~10k items twice every frame.
  - There are four tile workers instead of six. Tiles take 5–10 ms, and each worker keeps its own copy of the chart and decoded pictures.
- **No change in what is drawn.** Same tiles, same Atlas drawing, same picture decoder.
