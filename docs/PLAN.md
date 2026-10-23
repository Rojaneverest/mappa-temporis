# Mappa Temporis — Master Plan

*A deep-zoom atlas of world history. Working title: "a map of time", after the medieval* mappae mundi.

Status: **plan locked 2026-10-23** (v2 — revised for a calmer, less cluttered chart). Work has started at Phase 0.

---

## 0. In one paragraph

One continuous, poster-true artwork of human history from the first writing (3300 BCE) to today. It keeps the UsefulCharts grammar — time flows down the page, the world runs west → east, line width shows importance — but is built far larger and finer, so that every zoom level is a finished, *calm* composition. The important things are bold and colorful; the less important things are present but quiet (faint ink, small type), and the least important live only in the side panel and search. It should feel like wandering a place — a Bruegel painting, a medieval world map — where stepping closer always shows you more, but never shouts.

## 1. Principles

1. **Perspective** — one honest, equidistant time scale. Cleopatra lived closer in time to the Moon landing than to the building of the Great Pyramid; the chart should make you *feel* that.
2. **Presence** — each era looks and feels like itself: its writing surface, maps, scripts, objects, voices.
3. **Proof** — every fact has a date precision, a source, and a confidence level; every image a credit. Legend is drawn differently from attested history.
4. **Calm by default** *(added in v2)* — at every zoom level the screen must read at a glance. Importance decides how loud something is. Less important history is shown faintly or not drawn at all (it remains one click away in the Folio/search). We enforce this with hard density budgets, not good intentions. See §3.
5. **Poster-true** — nothing moves or reflows when you zoom. The Han dynasty is always in the same spot, like a city on a map. Only the overlay (rulers, headers, panels) is dynamic.

Lineage we study and quietly cite inside the chart: Priestley, *A New Chart of History* (1769) · Strass, *Strom der Zeiten* (1803) · Adams, *Synchronological Chart* (1871) · Sparks, *Histomap* (1931) · Rosenberg & Grafton, *Cartographies of Time* (2010, our design reference) · UsefulCharts.

## 2. The canvas (scaled down in v2)

| | v1 proposal | **v2 (locked)** |
|---|---|---|
| Time scale | ~25 units / year | **~12 units / year** (tuned in Phase 0) |
| Canvas | ~150,000 × 70,000 units | **~70,000 × 32,000 units** |
| Zoom range | ~300× | **~80×** (+2× overzoom for images) |
| Zoom levels | 5 + doorway | **4 + doorway** |
| Printed with legible fine print | ~15 × 30 m | **~7 × 15 m** |

**Time span.** 3300 BCE → today, equidistant. Above it, a compressed **Neolithic prologue** (10,000–3300 BCE) behind a clearly marked scale break. (Deep-time spiral title piece: later, optional.) The bottom edge is *today* — the "now" line moves daily, then fades into blank paper and a question mark.

**Columns, west → east:** The Americas (North America · Mesoamerica · Andes) │ Sub-Saharan Africa │ Europe │ Mediterranean & Near East (Egypt beside Mesopotamia) │ Steppe & Central Asia │ South Asia │ East Asia │ Southeast Asia │ Oceania — framed by two slim data margins. Column widths change smoothly by century to fit their lanes (dividers curve gently, like rivers). An optimizer keeps important neighbours adjacent; cross-column relationships (Kush → Egypt, the Mongols) are drawn as arcs.

**Eras and their turning points** (each boundary is a shaded band carrying small icons for the forces involved — climate, migration, disease, war, technology, ideas):

| Era | Span | Opening turning point | Forces |
|---|---|---|---|
| Prologue (compressed) | 10,000–3300 BCE | Farming, first towns | climate |
| Early Bronze Age | 3300–2200 BCE | Writing appears | — |
| Bronze Age | 2200–1200 BCE | 4.2-kiloyear drought | climate, migration |
| Iron Age | 1200–600 BCE | Bronze Age collapse | climate, migration, war |
| Classical Antiquity | 600 BCE–500 CE | History-writing; the Axial Age | ideas |
| Middle Ages | 500–1500 | Fall of the West, the 536 event, Plague of Justinian | climate, migration, disease |
| Early Modern | 1500–1760 | Black Death aftermath, printing, 1453, 1492 | disease, technology |
| Revolutions & Industry | 1760–1914 | Steam, the Atlantic revolutions | technology |
| World Wars & Cold War | 1914–1991 | World War I | war |
| Contemporary | 1991–today | The Internet | technology |

### Zoom levels (v2)

| Level | Zoom | What is *readable* | What is deliberately quiet |
|---|---|---|---|
| **The wall** | ×1 | Era names, region names, the colored river of the ~40 landmark (P1) lanes, ~25 landmark images, turning-point bands | Everything else is greeked or faint tint |
| **The era** | ×4 | P1 + P2 lane names, major events, hero images | P3 lanes as muted tint, no labels |
| **The century** | ×20 | P3 events, people, captions, quotes, coins | P4 "whisper" labels appear faint |
| **Detail** | ×80 | Fine print: credits, native scripts, footnotes, whisper labels readable | — |
| **Doorway** | click | The museum's own high-res scan (IIIF), the full Folio card | — |

Rules: **density-adaptive type** (ancient labels can be larger because there is room; modern ones smaller) and **greeking** (text too small to read is drawn as soft grey lines, never pixel mush).

## 3. Calm by default — the prominence system (new in v2)

Every lane, event, person, and image gets a **prominence** P1–P5, which controls *both* when it appears and how loud it is.

| Prominence | Meaning | How it is drawn | Rough share |
|---|---|---|---|
| **P1 Landmark** | Defines its era/region (Roman Empire, Han, Abbasid Caliphate, Inca…) | Full pigment, widest lanes, bold names visible from the wall | ~3% |
| **P2 Major** | Clearly important | Full pigment, normal labels | ~12% |
| **P3 Standard** | Worth seeing when you look | Muted pigment, regular labels | ~30% |
| **P4 Whisper** | Context, minor polities, secondary events | Hairline lanes in pale tint; small grey italic labels at ~45% contrast; no images; only readable at Detail zoom | ~30% |
| **P5 Archive** | Completeness | **Not drawn.** Lives in the Folio, search, "Meanwhile…", and the Atlas | ~25% |

**Hard density budgets, enforced by the build** (exact numbers tuned in Phase 0):

- At any zoom, any screen-sized window contains at most **~40 readable labels** and **~6 images**.
- At least **~35% of every screen is open paper**.
- The wall view uses colour for P1 lanes only; everything else is neutral.

If a region/time window exceeds its budget, the build **auto-demotes** the lowest-prominence items (P3 → P4 → P5) and reports it, so we curate deliberately instead of drowning. Prominence is seeded from data (Cliopatria territory area, population, number of linked events/Wikipedia languages) and then curated by hand.

**Optional layers are off by default** (toggled from a Layers menu): sky events, alternative calendars, threads, lenses, curiosities (shown, when enabled, as tiny ✦ marks at Detail zoom; content in the Folio), soundscape. Default margins show only a thin population curve and climate ribbon.

## 4. Art direction — "Atlas Antiqua"

UsefulCharts DNA (warm paper, coloured lanes, cut-out artifacts) raised to museum-catalogue craft. Alternate skins later ("Museum White", "Night Observatory"). One grid, one type system everywhere; era atmosphere is seasoning, never at the cost of legibility.

- **Substrates change as you scroll:** clay → papyrus → vellum → rag paper → newsprint → photo paper → screen. Real scans of blank historical pages, not fake noise.
- **"The world as they saw it":** behind each era at ~5% opacity, maps made at the time — Babylonian Map of the World; Ptolemy (Ulm 1482) and the Tabula Peutingeriana; al-Idrisi (1154), Hereford Mappa Mundi, Catalan Atlas (1375), Kangnido (1402); Waldseemüller (1507), Ricci's world map (1602); 19th-c. atlases; Blue Marble (1972); NASA Black Marble.
- **Image treatments say what something is:** artifacts → cut-outs with soft contact shadows; paintings/frescoes/miniatures → "tipped-in plates" with captions; coins → embossed roundels (rulers' portraits made in their lifetime); manuscripts → torn fragments; photographs → white-bordered prints. The medium evolves down the chart: relief → coin → mosaic → manuscript → woodblock → oil → engraving → photograph → film → pixel.
- **Of its time vs. imagined later:** era-made objects get an "of its time" mark; later depictions are labelled ("imagined, 1866"). Monuments drawn by public-domain travel artists with a shared engraved look (Catherwood, David Roberts, Piranesi, the Daniells, Hokusai, Hiroshige).
- **Colour = historical pigments.** Hue marks the cultural sphere so colour carries lineage (Rome's purple flows into Byzantium); lightness and width mark phase and prominence. Validated for neighbour contrast and colour-blind safety.

  | Sphere | Pigment | | Sphere | Pigment |
  |---|---|---|---|---|
  | North America | Hopewell copper `#B06C3E` | | Mesopotamia & Persia | Lapis lazuli `#2E4B96` |
  | Mesoamerica | Maya blue `#3B92AD` | | Islamic world | Malachite `#2E8A5C` |
  | Andes | Cochineal `#9C2541` | | Steppe | Scythian gold `#A88432` |
  | Sub-Saharan Africa | Red ochre `#9A4632` | | South Asia | Saffron `#DD7F2E` |
  | Celtic & Germanic Europe | Woad `#56748F` | | China | Cinnabar `#B8392D` |
  | Rome & Byzantium | Tyrian purple `#6C2D5F` | | Japan & Korea | Indigo `#34476F` |
  | Greece & Hellenism | Egyptian blue `#3D78BE` | | Southeast Asia | Celadon `#82AF96` |
  | Egypt & the Nile | Orpiment `#E0B83A` | | Oceania | Tapa `#8A5B3C` |

- **Lane grammar (the legend):** width = prominence (6 steps); solid = attested polity; dotted = peoples, language families, migrations; feathered ends = uncertain dates; mist texture + dashed edge = legendary (Xia, Romulus, Troy); stone texture = known only from archaeology (Indus, Norte Chico, Cahokia); smooth river-like forks/merges; solid arrows = conquest; thin dotted arrows = influence; horizontal bands = trade networks.
- **Type (all SIL OFL):** era titles with restrained period flavour (Cinzel, EB Garamond…); lane names in Roboto Flex (variable width fits names to lanes); labels in IBM Plex Sans Condensed; captions/quotes in Source Serif 4 italic; native scripts via Noto (𒆠𒂗𒄀 ki-en-gi · 𓆎𓅓𓏏𓊖 kmt · 𐎱𐎠𐎼𐎿 Pārsa · Ἑλλάς · 漢 · አክሱም). Unencoded scripts (Maya glyphs, oracle bone, rongorongo, Indus) as SVG drawings.
- **Landmarks for wayfinding:** ~25 hero images legible from the wall (Giza, Parthenon, Terracotta Army, Hagia Sophia, Angkor Wat, Great Zimbabwe, Chichén Itzá, Machu Picchu, Moai, Forbidden City, Great Wave, Earthrise…).
- **Composition pass per zoom level:** the algorithm drafts; each level is then balanced by eye.

## 5. Layers that put you there

Default **on**: Voices (short cited primary-source quotes, P2+ only), native-script names, daily-life cards (Folio only, ~80), thin population + climate margin.
Default **off** (Layers menu): sky events (Halley's returns, the 585 BCE eclipse, SN 1054, the pole star), calendar ruler (AUC, AH, AM, Buddhist Era, Chinese reign eras, nengō, Maya Long Count), curiosities (~300: Ea-nasir's complaint tablet, the oldest joke, Hagia Sophia runes, the Hurrian Hymn…), soundscape, "your lifetime" bar.

## 6. The explorer

- Smooth inertial pan/zoom, pinch, keyboard, double-click-to-fit, minimap.
- **Frozen headers:** sticky year ruler and region/lane headers; breadcrumb (World › Classical Antiquity › East Asia › Han).
- **Folio (side panel):** native name, dates + uncertainty, predecessors/successors, key facts, short summary, voices, gallery, people, events (click to fly), sources; "Read more" loads the Wikipedia summary live with attribution. P5 items live here.
- **Atlas:** synced world map from Cliopatria (Seshat; 1,600+ polities 3400 BCE–2024 CE, CC BY 4.0, with Wikidata IDs) at the year under the cursor; hovered lane's territory lights up; scrub to watch borders move.
- **Doorways:** click an image → the museum's high-res scan via IIIF.
- **Search (⌘K)**, **"Meanwhile…"** (click a year → what was happening everywhere, including P5 items), **Threads** (paper, numerals & zero, the alphabet, Buddhism, the Columbian Exchange, gunpowder, printing), **Lenses** (religion, science, art, war, trade, climate & disease, women in history), **Tours** (narrated camera flights, exportable as 4K video), time-distance tool, deep links, offline use, accessible outline view.

## 7. Content

| | Phase 1 slice | Full v1 — drawn on canvas | Full v1 — total incl. archive |
|---|---|---|---|
| Lanes / segments | ~80 | ~700 | ~1,200 |
| Events | ~400 | ~5,000 | ~12,000 |
| People | ~100 | ~800 | ~2,000 |
| Images | ~100 | ~1,000 | ~2,500 (galleries) |
| Voices | ~25 | ~300 | ~500 |

**Rights (v2): personal, non-commercial project.** Any openly viewable source is fair game — including British Museum (CC BY-NC-SA), Gallica, David Rumsey, Wikimedia NC files, and 20th-century photographs. We still credit everything (it's part of the craft) and store a `rights` field per image so the set can be filtered if the chart is ever shared publicly.

**Sources.** Structure: Wikidata (CC0), Cliopatria, Seshat, OWID/HYDE population, Reba et al. 2016 city sizes, Temperature 12k / PAGES 2k climate, eVolv2k / HolVol volcanoes. Images: The Met, Art Institute of Chicago, Cleveland, Smithsonian, NGA, Getty, Rijksmuseum, Paris Musées, British Museum, Gallica/BnF, Library of Congress, NASA, David Rumsey, Wikimedia Commons, Europeana. Text: written fresh (Claude drafts, Rojan approves), each fact checked against at least one reference.

**Editorial standards.** Every fact: date + precision + source(s) + confidence (attested / probable / disputed / legendary). Chronology conventions documented once (Middle Chronology for Mesopotamia; a standard Egyptian chronology; alternatives in fine print). Coverage matrix (era × region) with targets so Africa, the Americas, South/Southeast Asia, the steppe and Oceania are not footnotes. Automatic checks: dates inside parent spans, people alive at their events, credits present, label length limits, zero collisions, density budgets. No AI upscaling of historical objects.

**Data model (sketch):**

```yaml
# content/lanes/east-asia/han.yaml
id: han
name: Han dynasty
endonym: { text: 漢, script: Hani, translit: Hàn }
wikidata: Q7209
region: east-asia
sphere: sinic                      # → cinnabar
prominence: 1
span: 202 BCE – 220 CE             # stored as astronomical years (no year zero)
segments:
  - { name: Western Han, span: 202 BCE – 9 CE, weight: 5 }
  - { name: Xin (Wang Mang), span: 9 – 23 CE, weight: 2, style: interregnum }
  - { name: Eastern Han, span: 25 – 220 CE, weight: 5 }
relations:
  - { type: succeeds, lane: qin, at: 202 BCE }
  - { type: splits-into, lanes: [cao-wei, shu-han, eastern-wu], at: 220 CE }
events:
  - id: zhang-qian-west
    date: c. 138 BCE
    label: Zhang Qian's mission west opens the Silk Road
    prominence: 2
    thread: silk-road
    confidence: attested
    sources: [britannica:Zhang-Qian]
images:
  - asset: met-…
    anchor: { date: 100 BCE, side: right }
    treatment: cutout
    of-its-time: true
    rights: CC0
```

**Workflow:** scaffold candidates from Wikidata/Cliopatria → curate lanes, prominence, relations → draft labels with sources → automatic checks + review → layout + hand adjustments in the Atelier → publish. Research can run in parallel sessions per region later.

## 8. Tech architecture

```
content/*.yaml ──┐
open datasets  ──┼──► build pipeline ──► display list ──┬──► web explorer  · tiles drawn on demand
museum images  ──┘    validate, layout,  tiled, binary, ├──► print master  · wall-size PDF / TIFF
                      shape text, LOD    one truth      └──► tour videos   · 4K camera flights
```

**One renderer, three outputs.** The build compiles the chart once into a display list (every lane, label, image, texture, with exact positions and visibility ranges). The same Skia renderer draws it in the browser and in Node for print and video: what you see on screen *is* the print.

**Tiles drawn on demand** rather than a pre-rendered giant image: text stays sharp at any zoom, lenses/highlights redraw instantly, and we ship megabytes rather than gigabytes. Overview levels are pre-rendered for an instant first view.

**Skia (CanvasKit / WASM)** rather than the browser canvas: identical text metrics in every browser (labels are positioned once at build time and must fit exactly), complex-script shaping, blend modes and shaders for paper/pigment effects. ~3 MB, lazy-loaded. The native canvas is benchmarked against it in Phase 0; the drawing layer stays swappable.

| Layer | Choice |
|---|---|
| Language / repo | TypeScript everywhere (Python only for ML image cut-outs); pnpm workspaces |
| Content | YAML in git, Zod schemas, custom lints; Wikidata IDs on everything |
| Layout | Own engine: crossing-minimising lane order, separation constraints (VPSC), priority label placement on a collision grid, density budgets with auto-demotion, Knuth–Plass line breaking for captions; hand "pins" override |
| Rendering | CanvasKit in a Web Worker pool; pre-rendered WebP overview tiles |
| Viewer | OpenSeadragon 6 (worker ImageBitmap tiles) — or a small custom WebGL2/Canvas viewer if OSD fights us |
| UI | React + Vite, Radix, Motion, cmdk; MiniSearch; Flatbush spatial index |
| Maps | Cliopatria + Natural Earth, d3-geo, mapshaper |
| Images | Museum APIs → Apple Vision subject lifting (Swift CLI) / BiRefNet fallback → sharp (libvips) → AVIF/WebP pyramids; IIIF for originals |
| Fonts / icons | Noto, Cinzel, EB Garamond, Source Serif 4, Roboto Flex, IBM Plex; icons seeded from game-icons.net |
| Print / video | Same renderer in Node; skia-canvas vector PDF; libvips stitching; ffmpeg |
| QA | Vitest; Playwright visual snapshots of ~50 fixed views; perf budgets |
| Hosting | Local / private first; Cloudflare Pages + R2 if ever shared |

**Performance budgets:** first view < 2 s; 60 fps pan/zoom on Apple Silicon; median tile render < 30 ms; < 5 MB before first view (excl. images); capped tile cache (iPad-safe).

**The Atelier** (local editor mode): click to edit; drag lanes/labels/images → saved as "pins" in YAML; live warnings (collisions, budgets, missing sources/credits); coverage heatmap; before/after visual diffs.

### Repository layout

```
mappa-temporis/
  docs/            PLAN.md, DECISIONS.md, findings from spikes
  content/         YAML: eras, regions, lanes, events, people, images
  packages/
    core/          dates, schema, prominence, shared types
    render/        display list + Skia painters (browser & Node)
    layout/        lane ordering, label placement, budgets      (Phase 0b)
    pipeline/      data/image ingestion scripts                 (Phase 0c)
  apps/
    explorer/      the deep-zoom web app (Vite)
```

## 9. Roadmap

| Phase | Deliverable | Done when |
|---|---|---|
| **0. Prove it** *(in progress — 0a renderer & viewer and 0b layout & images done, see `docs/phase-0/`)* | (a) Renderer spike: Skia tiles in workers + deep-zoom viewer, multi-script text, a pigment lane on paper, greeking, prominence styling. (b) Layout spike on one region × era from real data. (c) 20 images through the full pipeline with credits. Output: a proof sheet of East Asia 600 BCE–600 CE at every zoom level | 60 fps, sharp everywhere, calm at every zoom, and Rojan says "that's the look" |
| **1. Vertical slice** | Classical Antiquity across all regions, with Folio, Atlas, search, frozen headers, Silk Road thread, one tour | You'd hang it on a wall |
| **2. Skeleton** | All eras/regions at P1–P3 (~400 lanes, ~2,500 events), substrates, era maps, turning-point bands, margins | The poster exists end to end |
| **3. Depth** | Era-by-era P3–P5 fill, people, voices, daily life, coins, native names; balance audits | Coverage targets met within density budgets |
| **4. Experience & editions** | Tours + video, lenses, threads, Meanwhile, layers, print editions, offline, accessibility | Launch (private) |

Real time estimates come after Phase 0.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Clutter / visual overload | Prominence system, hard density budgets with auto-demotion, layers off by default, composition pass per level |
| Auto-layout looks mechanical | Algorithm drafts; Atelier pins; composition pass |
| Factual errors at scale | Sources required by lints, confidence tags, Wikidata cross-checks, spot audits |
| Eurocentric drift | Coverage matrix with targets |
| Cut-out quality | Machine masks + manual review; paintings never cut out |
| Weak devices | Pre-rendered tile fallback; simplified distant views |
| Scope creep | Phase gates; slice before breadth |

## 11. Locked decisions

See [DECISIONS.md](DECISIONS.md).
