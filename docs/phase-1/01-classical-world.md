# Phase 1 — the Classical World slice (in progress, 2026-10-23)

## Done
- **Multi-sheet build:** `pnpm build:chart` builds every `content/sheets/*.yaml`. Open one with `?sheet=<id>` (the default is `classical-world`). Each sheet gets its own subset fonts.
- **Content across 9 regions, 800 BCE – 700 CE:** 141 lanes and 261 events, each with prominence, confidence and sources, plus 34 images. 33 of the images and 256 of the events are placed on the canvas; the other 5 events fall outside the window.
- **New pigments:** kermes (Phoenicia/Carthage), tekhelet (Israel/Judah), frankincense (Arabia), Etruscan red.
- **Layout fixes:**
  - Track width now follows real label and image demand: the world sheet went from 77k to 65k units wide.
  - Labels measure free space at every slide position: archived labels went from 13 to 0.
  - Long cross-region arrows fade in only when zoomed in.
- **Viewer fixes:**
  - Calm fade-ins are now evaluated at CSS zoom, not device pixels. Before this, everything appeared at half the intended zoom on Retina screens.
  - Region headers in the HUD shrink to fit or are dropped instead of overlapping.

## Next
- Visual review of the world sheet at each zoom level, then a composition pass. The Near East and Americas still have wide gaps.
- Endonyms in non-CJK scripts on the canvas (needs Phoenician, Arabic, Armenian, Brahmi and Ge'ez fonts).
- Images for the Celts, the Hopewell, Nazca and Carthage. The Lapita cut-out still needs checking.
- Atlas (Cliopatria borders), the Silk Road thread, and the first tour.
- A Safari/iPad check.
