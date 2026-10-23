# Phase 0b — layout engine & image pipeline (2026-10-23)

## Layout engine (`packages/layout`)

- **Tracks, not hand-pinned columns.** Lanes linked by `becomes` / `succeeds` (or the first child of `splits-into`) form chains, and a chain stays in one track. Chains are packed greedily into as few tracks as possible within each group (China, Korea, Japan…). The tracks are then ordered to minimise the sum of relation weight × distance:
  - cross-group relations pull towards the facing edge;
  - heavy tracks drift towards the middle;
  - groups of ≤ 7 tracks are searched exhaustively, larger groups by pairwise swaps.

  `column:` in YAML remains as an optional pin.
- **Stable straight columns (default).** A "flowing" mode was built and tried, where tracks take space only while occupied and drift smoothly. On the proof sheet it made lanes swing hundreds of units sideways and read as restless, the opposite of calm, so stable mode is the default and flow is kept behind `mode: 'flow'` for later experiments.
- **Collision grid** (16-unit cells) marks lanes, seals, names, relation ribbons/arrows, margins and everything placed.
- **Priority placement.** Order: P1–P2 labels, then P1–P2 images, P3 labels, P3 images, P4 labels.
  - Labels try the right side, then the left. They slide up to 28 years off their date (with a curved leader line).
  - When a label still doesn't fit, it drops one prominence step at a time and is finally archived to the Folio.
  - Images search both sides near their date and shrink up to twice before giving up.
- **Density budgets.** At 4 zoom checkpoints, each 1440×900 window may hold at most 40 readable labels and 6 images; the least important are demoted. On this sheet they never trigger (0 demotions). The unit test covers the mechanism, but real dense content (the modern era) will be the true test.
- **Steadiest-stretch naming:** vertical names go on the part of a lane that drifts least.

Proof sheet result: 37 lanes, **50/51 events drawn** (1 archived for lack of room, 1 slid off its date), **13/13 images**, 16,520 × 21,288 units, build in ~2 s.

## Image pipeline (`scripts/images/pipeline.ts`, `tools/cutout`)

1. Content declares images: `source: met:<id>` or `commons:File:<name>`, plus date, prominence, `cutout | plate`, caption.
2. Metadata and credits come from the **Met Open Access API**. Its `/v1/search` endpoint was retired on 2026-10-01, so searching uses `/v1.1/search`; object lookups still use `/v1/objects/<id>`. The other source is the **Wikimedia Commons API** (license and artist from extmetadata).
3. **Cut-outs** use Apple Vision subject lifting (`VNGenerateForegroundInstanceMaskRequest`) through a small Swift CLI (`tools/bin/cutout`, built with `swiftc -O tools/cutout/cutout.swift -o tools/bin/cutout`). Quality on museum photos is excellent: bronzes, the gilt Buddha, the camel, the Silla crown and the Xiongnu buckle all came out clean.
4. A soft contact shadow is baked in with sharp. Then WebP sizes are written (128 → 2048 on the long side, plus the native size).
5. `apps/explorer/public/img/manifest.json` and **`docs/CREDITS.md`** are generated automatically.

The renderer picks the smallest stored size that is at least as sharp as the screen needs. Workers fetch and decode images before painting a tile, so tiles never appear half-finished. Plates get a pale mount, a hairline frame and a soft shadow.

## Fonts

The build subsets every font to the characters the chart actually uses (`subset-font`, HarfBuzz): **28 MB → 1.06 MB**. Every font gets the same character set, so fallback behaves exactly as when the build measured the text.

## Viewer fixes

The camera stays fitted until the user moves it. Previously, loading in a hidden pane (width 0) produced a blank first view and a negative zoom readout.

## Measurements

Tile render median 1.4–2.5 ms, p95 26–50 ms (6 workers, DPR 2). No console errors. 17 unit tests pass and the typecheck is clean.

## Next

- Picking: hover/click a lane, event or image to open the **Folio** side panel (credits, sources, Wikipedia summary).
- Frozen lane headers, minimap, URL deep links.
- A denser test sheet to exercise the density budgets for real.
- Safari / iPad check.
- Whether the Axial Age needs a band at all (crises keep bands; ideas get a caption only).
