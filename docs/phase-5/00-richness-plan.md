# Phase 5 plan — rich by default (draft, 2026-10-24)

Why does the UsefulCharts poster feel rich, and ours feel empty? This note gives the diagnosis, with numbers, and a plan to fix it. Nothing here is built yet. It reverses part of decisions 9 and 10, so it needs Rojan's go-ahead first.

## Diagnosis: it's the design, not the information

The comparison uses the same window: the whole world, from 900 BCE to 1100 CE. On the UsefulCharts poster that window fills one screen. By eye, it carries about 250–300 readable labels and about 25 pictures.

| Same window, whole world, 900 BCE – 1100 CE | UsefulCharts | Mappa Temporis today |
|---|---|---|
| Event, person and voice labels in it | ~300 | **~820** (401 events, 28 strong, 283 whispers, 107 captions) |
| Pictures in it | ~25 | **62** lane images (plus engravings and maps) |
| Readable on one screen showing all of it | nearly all | **0**: at 1440 px wide the window is 310 px tall and every label is under 8 px |
| At your screenshot's zoom (s ≈ 0.1) | — | 61 text marks in view, **5 readable** (lane names only), 28 event labels drawn at 2.5–4 px, 1 picture |
| Zoom needed to read event text | — | s ≈ 0.3. One screen then shows **4% of the world's width and 250 years**, and holds 8 readable marks |

**We have more information than they do in that window. It's spread across a canvas that is far too big for its ink, and our own rules hide most of it.** There are five causes, largest first.

1. **The ink-to-paper ratio is about 10× too low.**
   - Measured in widths of a typical (P3) label's letters (ems), the world is about 4,450 ems wide on our sheet. On theirs it is about 220.
   - Time runs at 2 years per em for us and about 16 years per em for them.
   - The text, lanes and pictures are tiny compared with the distances between them. So no zoom level shows both a lot of history and readable text.
2. **Each region's column is as wide as its busiest century, at every date.**
   - `flowTracks` sizes a region to "hold its busiest moment".
   - Europe has 15 lanes around 1000 CE but only 3 at 1 CE, so in antiquity 80% of its 19,500-unit column is empty paper. That's the blank area right of Rome in your screenshot, where the Colosseum engraving sits.
   - The canvas is 111k × 74k units. The plan's target was 70k × 32k.
3. **Calm rules hide what we have.**
   - The budgets allow at most 40 labels and 6 pictures per screen, with at least 35% open paper.
   - P3 labels fade in only from s ≈ 0.17–0.26, P4 from 0.42–0.62, and P2/P3 pictures fade in as well.
   - Zoomed out, labels vanish instead of becoming the grey "text texture" that makes a poster look full from a distance.
   - Decision 10 did this on purpose. Measured against UsefulCharts, it overcorrected.
4. **The connections between lanes are missing.** Much of their richness is the drawing *between* the lanes, and we draw almost none of it:
   - spaced-caps movements across the field ("AXIAL AGE", "HELLENISM", "ISLAMIC GOLDEN AGE", "SILK ROAD CONNECTED");
   - labelled conquest arrows ("Kushites conquer Egypt…", "EMPIRE DIVIDED BY THE DIADOCHI");
   - branching trees (Rome forking into West and East; Germanic tribes fanning into Visigoths, Ostrogoths, Vandals and Franks; the caliphates branching).

   Ours are unlabelled hairlines, our threads are off by default, and Byzantium sits far from Rome.
5. **Line width doesn't show power over time.**
   - Their Han and Roman bars swell at their peaks and thin in decline. With big names inside, they draw the eye at once.
   - Our lanes have nearly constant widths. Even P1 names are capped at 150 units, which is 15 px at your zoom.
   - Event text has a 4× size range (54 → 13). Their event text is all one size, and the hierarchy comes from the lanes and pictures.

Only one real information gap is left: connective content (movements, labelled relations, process notes such as "Spread of Olmec culture"). Pictures are the next one, once they're big enough to see.

## Targets (the reference "era view")

The reference is a 1440×900 screen at s = 0.1. That's your screenshot's zoom, about a quarter of the world's width and about 750 years.

- Every P1–P3 label is at least 9 px, and P4 is legible grey at about 7 px.
- **150–250 readable labels and 15–25 pictures per screen**, with open paper of at most about 20%.
- Zoomed out (the wall view), labels become greeked texture, not blank paper. P1 pictures, lane names and movements stay readable.
- No event lost: the drawn count stays at or above 1,800, and demotions are reported.

## Plan

Each step runs on `phase-5/richness` and is checked against the numbers above with a new `pnpm density`. Tuning starts on the classical-world sheet, where builds are fast, and then moves to the world sheet.

### 5a. Measure (small)
- Turn the density script used for this note into `pnpm density`.
  - It reports readable labels, pictures and open paper at the reference views: the wall view, the era view at s = 0.1 in six places, and the century view.
- Add a side-by-side capture of our 900 BCE – 1100 CE window to compare with the UsefulCharts frame.

### 5b. Re-proportion: "shrink the paper, keep the ink" (the biggest change)
- **Bigger ink against fixed time.** Keep 12 units/year so no positions churn.
  - Event text sizes become P1 ~120, P2 ~105, P3 ~90 (bold for P1) and P4 ~70 grey. That's a flatter hierarchy, like theirs.
  - Pictures about 3× bigger (P1 ~2,200 units, P3 ~900).
  - P1 lane names fill the lane.
  - The viewer's top zoom drops from 2.5 to about 1. The zoom range becomes ~20×, not ~80×.
- **Narrow, wrapped labels** in the UsefulCharts style: label columns stay about 350–450 units wide, so the bigger text wraps to 3–5 words per line and 2–4 lines. Labels sit on both sides of a lane and in the gaps between lanes.
- **Region columns flow over time**, as PLAN §2 always intended (curved dividers). The total width becomes the busiest moment of the *whole world*, not the sum of each region's busiest moment. Expected canvas: about 55–65k units wide.
- **Fades become greeking.** Labels and pictures are always drawn; below about 6 px, text becomes soft grey lines (`GREEK_BELOW_PX` already exists). Only P4 fades in early, and P5 stays in the Folio.
- **New budgets:** at most ~220 readable labels and ~25 pictures per 1440×900 screen, and at least ~15% open paper. Auto-demotion stays.

### 5c. Structure between lanes
- **Forks and merges:** `splits-into` and `merges-into` draw as Y-branches out of the parent's body (Rome → West/East, Alexander → Diadochi, Germanic peoples → tribes, Abbasids → successor states).
- **Labelled relation arrows:** `conquers`, `influences` and migrations get a short label and the lane colour, drawn across the gap.
- **Cross-region neighbours:** the track order pulls related lanes to the shared border. Rome goes to Europe's east edge and Byzantium to the Near East's west edge.
- **Width follows power:**
  - P1 and P2 lane widths over time are seeded from Cliopatria territory area per century (the data is already in the Atlas), then curated with segment weights.
  - P1 peaks reach about 500–600 units, and P4 lanes come down to about 40.

### 5d. Content: the connective layer and pictures
- **Movements** (new content type, P1–P2, ~60–80):
  - examples: Axial Age, Hellenism, Pax Romana, Silk Road, Bantu expansion, Islamic Golden Age, Polynesian voyaging, Pax Mongolica, Renaissance, Columbian Exchange, Scientific Revolution, Enlightenment, Industrial Revolution, Decolonisation;
  - set in spaced caps in the field, placed by the layout in free cells across the lanes they cover.
- **Process notes:** span events with a bracket ("Spread of Olmec culture", "Aridification pushes settlement south").
- **Pictures:** 95 → ~400 (every P1 lane at least 3, P2 at least 1–2), through the existing `pnpm images` pipeline, region by region.
- **Shorter labels:** the median label is 7 words now, and the target is 3–6. Add a length lint per prominence.

### 5e. Composition pass and review
- Compare each era view with the UsefulCharts frame side by side.
- Pins only where the layout can't solve something.
- Update the Phase 5 notes and decisions, then merge.

The old Phase 5 (layers, print, offline, accessibility) becomes Phase 6.

## Decisions to log once approved
- Supersede **9**: canvas scale. Ink is about 3.5× larger against the same time scale, and the zoom range is about 20×.
- Supersede **10**: "calm by default" becomes **"clear by hierarchy"**. The P1–P5 system stays, but it sets loudness (width, colour, weight), not emptiness. New budgets: ~220 labels, ~25 pictures, ≥15% open paper. Greeking replaces fade-to-nothing.
- Region columns flow over time.
- Movements become a content type.

## Risks
- **Clutter.** Hierarchy has to carry the calm: strong P1 lanes and names, one event-text size, grey P4. The budgets still apply.
- **Dense lanes (Rome, China, modern Europe) demote more labels.** They wrap on both sides, slide within 28 years, and are demoted to P4/P5 when there's no room. `pnpm density` and the build report make this visible.
- **Engravings get less room.** They're decoration and can shrink; movements and pictures matter more.
