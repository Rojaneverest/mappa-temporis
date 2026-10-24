# Phase 5a–5b — measure, re-proportion, deep time (2026-10-24)

Branch `phase-5/richness`. Decisions 46–52 are logged.

## 5a. Measure
- **`pnpm density [sheet]`** (`scripts/density.ts`) reports these numbers at fixed views on a 1440×900 screen:
  - readable labels (8 px or more);
  - small labels (5–8 px);
  - greeked labels (under 5 px, drawn as grey lines);
  - pictures;
  - open paper.
- The views are the wall (cover), ten era views at s = 0.1 centred on landmark lanes, and one century view. Baselines and after-5b reports are in this folder.
- The bottom help bar is gone. Its shortcuts are now in the toolbar tooltips (Layers (L), Lenses (K), Threads (T), Atlas (A), Search (⌘K or /)).

## 5b. Re-proportion
- **Columns flow over time** (decision 48, `packages/layout/src/columns.ts`).
  - Each succession chain is one straight column that only takes room while it's alive.
  - Columns are kept in west → east order, and each one clears every column it overlaps in time (VPSC "satisfy" with block merging).
  - Each column sits as close as it can to an even spread of whatever is alive across its lifetime.
  - Columns are then moved within their group wherever that narrows a region; each step away from the relation order costs a little.
  - Region headers in the viewer follow the columns down the sheet (`regions[].samples`).
- **Ink.**
  - Event text is 120 / 105 / 90 / 70 units for P1–P4, so P3 is 9 px at s = 0.1.
  - Lanes are 30–480 units wide. P1 names go up to 320 units.
  - Pictures are 900–2000 units on the long side.
  - The top zoom is now 1.2 (it was 2.5).
- **Labels.**
  - No date prefix on the canvas (decision 51).
  - Labels wrap narrow, never mid-word.
  - Both sides are tried at every slide step.
  - A label can be set out from its lane with a leader line (landmarks reach furthest).
  - P1–P2 labels slide further from their date before giving way.
  - Each lane asks for label room from its label density per century of sheet height; the busiest lanes also keep room on their left.
  - The build prints the labels that found no room, by prominence. They stay in the Folio, search and Meanwhile.
- **Fades become greeking.**
  - Text under 5 px is drawn as grey lines, so the wall view reads as texture, not blank paper.
  - Only P4 labels and lane names fade in, and P3 pictures appear from the overview zoom.
  - Budgets are 220 labels and 25 pictures per screen, checked at cover, 0.06, 0.1 and 0.2.
- **Deep time** (decision 49).
  - `world.yaml` starts at 3300 BCE.
  - `world-deep.yaml` extends it (new sheet `extends:`) from 10,000 BCE and uses the world Atlas (`atlas: world`).
  - A fold pill at the top of time, or Layers → Time → "Deep time", switches sheets. The switch keeps the year, region and scale, and the choice is remembered.
  - Unfolding lands on the 3300 BCE seam.
  - Lanes older than the window show "from …" at their top.
  - Opening a pre-3300 entry from search or Meanwhile switches to the deep sheet.

## Numbers (world sheet; before → after)
| | Before | After 5b |
|---|---|---|
| Sheet | 111,406 × 73,986 (from 10,000 BCE) | **96,679 × 63,936** (from 3300 BCE) |
| Era view at s = 0.1: readable labels | 4 | **45** (14–69) |
| Era view: pictures | 1.8 | **4.1** |
| Era view: open paper | 86% | **67%** |
| Wall view | 281 greeked marks, 59% open | 1,375 greeked marks, 45% open |

Classical sheet era views: 5 → 45 readable labels, 2.8 → 6.2 pictures, 84% → 63% open.

## Not met yet, and why
- **The targets (150–250 labels, 15–25 pictures, at most 20% open) are not reached.**
  - Straight columns in a fixed west → east order form "staircases". The tightest packing is 83–89k units, against a busiest single moment of about 62k.
  - At sparse dates the even spread leaves wide gaps.
  - The rest of the gap is the plan's later steps:
    - 5c: forks, labelled arrows and Rome next to Byzantium, which draw into the gaps;
    - 5d: zones and movements in the open field;
    - 5e: pictures, 95 → ~400.
- **Labels without room.**
  - World: P1 1 (the moai), P2 18, P3 147, P4 136, out of about 2,100. Classical: P2 8, P3 54, P4 35.
  - They cluster on dense short lanes: the United States, the Ottomans, Tonga, Fiji, Mali, England, Athens.
  - They stay in the Folio. Shorter labels (the 5e lint) and 5c's structure should bring them back.
- **Engravings.** 26 of 31 still find room; 4 don't (they're decoration).
- **First paint in the browser pane took several seconds** on a cold dev-server load. It isn't a rendering regression: the whole wall view draws in 155 ms in Node, against 151 ms on `main`.
