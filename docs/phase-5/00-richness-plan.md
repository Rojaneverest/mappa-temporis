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

**The shape of the sheet tells the same story.** The full UsefulCharts poster is portrait, about 0.7 wide per 1 tall. Ours is landscape at 1.5 wide per 1 tall. Relative to its time span, ours is about twice as wide, and that extra width is the empty paper.

### Does the 10,000 BCE prologue cause it? (Rojan's question)
It's part of the answer, but a small part.
- The prologue (10,000–3300 BCE, already squeezed to ⅛ scale) takes **13.6% of the sheet's height**.
- Only **7 of 386 lanes** and **96 of 2,734 Folio entries** live entirely before 3300 BCE. Another 22 lanes cross into it.
- The emptiness is mostly **horizontal**, from causes 1 and 2. Removing the prologue makes the sheet shorter but no less wide; the ratio goes from 1.51 to 1.74.
- What it does fix:
  - the opening view starts where UsefulCharts starts, with writing, instead of with thinly populated deep time;
  - the wall view gets about 9% bigger.

So it's worth doing, as the default and not just as an option. It joins 5b below.

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
- **Remove the bottom help bar** (`#help` in `apps/explorer/index.html`: "Scroll or pinch to zoom · drag to pan · …"). Keep the date-and-era box (`#status`).
  - The keyboard shortcuts it listed move into the toolbar buttons' tooltips ("Lenses (K)", "Threads (T)", "Meanwhile (Y)", "Layers (L)", "Atlas (A)"), so they stay discoverable.

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
- **"Since writing" is the default; deep time folds away.**
  - The world sheet is built twice: `world` (3300 BCE → today, the default) and `world-deep` (10,000 BCE → today, as now). Each build stays poster-true. The viewer doesn't cut a band out of one sheet, which would clip lanes, engravings and era maps at the seam.
  - Above 3300 BCE, a thin fold strip reads "Before writing · 10,000–3300 BCE ▾". Clicking it, or the Layers toggle "Deep time", switches sheets and keeps the camera on the same year and region. The choice is remembered.
  - The 22 lanes that cross 3300 BCE start with a feathered top and a small "from c. 7400 BCE" note.
  - The 96 prologue entries stay in search, the Folio and Meanwhile. Opening one switches to the deep sheet.
  - The Atlas index is shared by both sheets, so no second Atlas build.

### 5c. Structure between lanes
- **Forks and merges:** `splits-into` and `merges-into` draw as Y-branches out of the parent's body (Rome → West/East, Alexander → Diadochi, Germanic peoples → tribes, Abbasids → successor states).
- **Labelled relation arrows:** `conquers`, `influences` and migrations get a short label and the lane colour, drawn across the gap.
- **Cross-region neighbours:** the track order pulls related lanes to the shared border. Rome goes to Europe's east edge and Byzantium to the Near East's west edge.
- **Width follows power:**
  - P1 and P2 lane widths over time are seeded from Cliopatria territory area per century (the data is already in the Atlas), then curated with segment weights.
  - P1 peaks reach about 500–600 units, and P4 lanes come down to about 40.

### 5d. Look: the poster grammar
5b and 5c make the chart dense. This step makes it *look* like a UsefulCharts poster, based on Rojan's close-up screenshots (Bronze Age, Iron Age, early Middle Ages).
- **Transit-map shapes.**
  - Lanes are flat bars with rounded ends.
  - Forks get chunky shoulders: Rome → Western/Eastern, Charlemagne → West/East Francia, Abbasids → Fatimids, Rum, Seljuks.
  - Branches and sideways shifts run as straight horizontals plus 45° diagonals, not soft splines.
  - Successor states in one track sit as joined pills (Rashidun → Umayyad → Abbasid). Short-lived peoples are ovals or pills (Huns, Turks, Germanic tribes).
  - The straight tracks of decision 14 stay; only branches and jogs change shape.
- **Peoples and language families as dotted lanes.** A new `basis: people` is drawn as a dotted line in the sphere colour, and it can fan out on labelled dotted diagonals: Indo-Europeans → Centum/Satem → Hellenic, Anatolian, Indo-Iranian; Germanic peoples → Visigoths, Vandals, Franks; Bantu; Austronesians.
- **No dates on canvas labels.**
  - Position already shows the date, so the label is just "Hannibal crosses the Alps".
  - The date appears on hover, in the Folio and Meanwhile, and on the canvas only at the detail zoom.
  - This shortens every label and is a big part of UsefulCharts' clean look.
- **A flat, brighter palette.**
  - The historical pigments are lightened to UsefulCharts' lightness: lilac Rome, sky-blue Greece, yellow Egypt, green Islam, orange India, coral China.
  - P1–P3 lanes get the same strength of colour. Importance shows through width and name size, not paleness. Only P4 is a pale tint.
  - Lane and segment names are bold, white on dark colours and ink on yellows, and fill the bar (Old / Middle / New Kingdom inside Egypt).
- **Zones and bands in the field.**
  - Translucent grey boxes mark region-periods ("GREEK 'DARK AGES'", "WESTERN EUROPEAN 'DARK AGES'").
  - Full-width grey bands with spaced-caps titles mark world events: the 4.2-kiloyear event, the Bronze Age collapse, 535–36 and the plague.
  - Turning points move from the left margin into the field (amends decision 23). The margin keeps the era names.
- **Paper.**
  - One continuous public-domain early-modern world map (Ortelius or Blaeu style) is ink-printed faintly behind the whole sheet, like their antique-map ground.
  - White century rules (already there) stay, plus a darker rule at each era boundary.
- **Group headers.** Small frozen headers name the peoples of the tracks on screen ("Egyptians", "Sumerians", "Indo-Europeans", "Indus Valley Peoples"), under the region headers.
- **Type.**
  - Event labels share one size, in a clean dark grey sans, in sentence case.
  - Key events are bold and larger ("Bronze Age Collapse").
  - Movements use spaced caps.
- **Pictures.**
  - Cut-outs and white-matted plates with soft shadows, as now, but large.
  - They may sit over open paper next to their lane, and over thin neighbours where the layout allows.
- **What stays ours.** Native names, voices, people's lifetime bars and coins come in at the century zoom, so the era view reads as the poster. These are additions UsefulCharts doesn't have.

### 5e. Content: the connective layer and pictures
- **Movements** (new content type, P1–P2, ~60–80):
  - examples: Axial Age, Hellenism, Pax Romana, Silk Road, Bantu expansion, Islamic Golden Age, Polynesian voyaging, Pax Mongolica, Renaissance, Columbian Exchange, Scientific Revolution, Enlightenment, Industrial Revolution, Decolonisation;
  - set in spaced caps in the field, placed by the layout in free cells across the lanes they cover.
- **Process notes:** span events with a bracket ("Spread of Olmec culture", "Aridification pushes settlement south").
- **Pictures:** 95 → ~400 (every P1 lane at least 3, P2 at least 1–2), through the existing `pnpm images` pipeline, region by region.
- **Shorter labels:** the median label is 7 words now, and the target is 3–6. Add a length lint per prominence.

- **Peoples and language-family trees** for the new dotted lanes (Indo-European, Bantu, Austronesian, Turkic, Germanic, Slavic), with their branch labels.
- **Zones:** about 20–30 region-periods for the grey boxes, plus field titles for each era's turning point.

### 5f. Composition pass and review
Matt Baker places every UsefulCharts label by hand; our layout is automatic. Getting the last stretch of "feel" takes a by-eye pass with pins, era by era, and that's the plan for this step.
- Compare each era view with the UsefulCharts frame side by side.
- Pins only where the layout can't solve something.
- Update the Phase 5 notes and decisions, then merge.

The old Phase 5 (layers, print, offline, accessibility) becomes Phase 6.

## Decisions to log once approved
- Supersede **9**: canvas scale. Ink is about 3.5× larger against the same time scale, and the zoom range is about 20×.
- Supersede **10**: "calm by default" becomes **"clear by hierarchy"**. The P1–P5 system stays, but it sets loudness (width, colour, weight), not emptiness. New budgets: ~220 labels, ~25 pictures, ≥15% open paper. Greeking replaces fade-to-nothing.
- Region columns flow over time.
- Movements become a content type.
- Amend **2** and **22**: the default sheet starts at 3300 BCE. The 10,000 BCE prologue becomes the folded "deep time" sheet, still on the ⅛ scale.
- The bottom help bar is removed, and shortcuts live in the toolbar tooltips.
- Amend **14**: tracks stay straight, but forks, branches and jogs use horizontals and 45° diagonals with rounded bars.
- Amend **23**: turning points move into the field as titled bands; the left margin keeps era names and era maps.
- Poster palette: lighter, flat pigments with equal strength for P1–P3. Width carries importance.
- Canvas event labels drop their date prefix below the detail zoom.
- New lane basis `people` (dotted), and zones (region-period boxes) as content.

## Risks
- **Clutter.** Hierarchy has to carry the calm: strong P1 lanes and names, one event-text size, grey P4. The budgets still apply.
- **Dense lanes (Rome, China, modern Europe) demote more labels.** They wrap on both sides, slide within 28 years, and are demoted to P4/P5 when there's no room. `pnpm density` and the build report make this visible.
- **Engravings get less room.** They're decoration and can shrink; movements and pictures matter more.
