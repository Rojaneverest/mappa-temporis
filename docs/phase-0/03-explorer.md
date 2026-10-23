# Phase 0c — explorer interactions (2026-10-23)

- **Folio side panel.** The build now writes `chart/<sheet>.folio.json` alongside the display list. It holds every lane, event and image with its dates, prominence, confidence, endonym, phases, connections, events, objects, sources, credits and a world box to fly to. Items archived for calm (P5) live here too, marked "not drawn on the chart".
- **Live Wikipedia summaries** (REST `page/summary`) with attribution (CC BY-SA 4.0), loaded when the panel opens.
- **Picking:** a Flatbush index over items carrying a `ref`. Text and images win over the lane underneath. Hidden, faded or too-small items are not pickable. Hover shows a thin outline and names the item in the status line; selection gets a stronger outline.
- **Flights** zoom out a little mid-way over long distances, like a map. Events land with about a century of context.
- **Deep links:** `#v=<cx>,<cy>,<zoom>&s=<id>` is written as you move and select, restored on load, and followed on `hashchange`.
- **Pinned lane headers:** once a lane's own name has scrolled off the top, its name appears in a strip under the region headers. Which prominence levels are pinned depends on the zoom.
- **Minimap** (rendered once by a worker), shown when zoomed in. Click or drag it to jump; press M to hide it.
- **Fixes:**
  - The fit scale is recomputed on every resize, which fixes a camera stuck at a near-zero scale after loading in a hidden pane.
  - Lane outlines drop redundant points: display list 359 KB → 86 KB.
