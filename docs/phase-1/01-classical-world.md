# Phase 1 — the Classical World slice (2026-10-23)

The vertical slice from the plan: all nine regions, 800 BCE – 700 CE, with Folio, Atlas, search, frozen headers, the Silk Road thread and a tour.

## Content
- 141 lanes, 263 events and 38 images (Met Open Access + Wikimedia Commons, credits in `docs/CREDITS.md`).
- On the canvas: 258 events, 37 images. Everything else is reachable in the Folio and search.
- Native-script names drawn at the head of lanes: Chinese seals, plus Old Persian, Hieroglyphic, Phoenician, Greek, Armenian, Arabic, Ge'ez and Brahmi (Noto fonts, subset per sheet).
- New pigments: kermes (Phoenicia/Carthage), tekhelet (Israel/Judah), frankincense (Arabia), Etruscan red.

## Layout & rendering
- **Multi-sheet build:** `pnpm build:chart` builds every `content/sheets/*.yaml`; open one with `?sheet=<id>`.
- **Track width:** margin + the widest lane in the track + the labels and images it actually carries. The world sheet went 77k → 51k units wide with no labels lost.
- **Label placement:** labels measure the free run at every slide position, so they no longer give up when their exact date is crowded.
- **Long arrows and split ribbons** (> 2,500 units) become thin threads that fade in only up close.
- **Fade-ins are evaluated at CSS zoom.** Before, on Retina screens everything appeared at half the intended zoom.

## Explorer
- **Threads (layers, off by default):** Silk Road, the alphabet, writing systems, numerals & zero, money. Each has its stops in the Folio and a "view" flight.
- **Atlas:**
  - Cliopatria borders (Seshat, CC BY 4.0) for the year under the cursor.
  - 109 of the 141 lanes are linked to their territories, through hand-picked names, then exact names, then Wikidata. Cliopatria tags its "Roman Empire" with Byzantium's QID, so IDs alone mislink.
  - Hover or select a lane to light up its territory; click a polity to open its lane.
  - Build with `pnpm atlas`.
- **Search:** ⌘K or `/` across every lane, event, object and thread, including ones archived off the canvas.
- **Tours:** narrated camera flights defined in `content/tours/*.yaml` and checked at build time. First tour: *The Axial Age* (10 stops).

## Known gaps → next
- Safari / iPad not yet tested.
- Archaeological cultures (Nok, Hopewell, Nazca, Andean cultures, Lapita…) have no Atlas territories; Cliopatria covers states only.
- Small screens: the Atlas and the tour card can overlap.
- Next: Phase 2, the whole skeleton across all eras.
