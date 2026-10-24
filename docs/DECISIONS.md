# Decisions log

| # | Date | Decision | Why |
|---|---|---|---|
| 1 | 2026-10-23 | Interactive web first; print as a later edition | Deep zoom is the primary experience |
| 2 | 2026-10-23 | 3300 BCE → today, equidistant, plus a compressed Neolithic prologue; deep-time spiral later | UsefulCharts parity + origins |
| 3 | 2026-10-23 | Personal, non-commercial project: any openly viewable source allowed (incl. NC licenses, modern photos); credits kept, `rights` field stored | Rojan will not sell it |
| 4 | 2026-10-23 | Style: "Atlas Antiqua" first | Warm, UsefulCharts-like, museum craft |
| 5 | 2026-10-23 | Private/local until at least Phase 2 | — |
| 6 | 2026-10-23 | Claude drafts content; Rojan reviews | — |
| 7 | 2026-10-23 | English only for now (Wikidata IDs keep i18n possible) | — |
| 8 | 2026-10-23 | Working title: *Mappa Temporis* | — |
| 9 | 2026-10-23 | **Scale reduced:** ~12 units/year, ~70k × 32k canvas, ~80× zoom, 4 zoom levels | v1 scale would look clogged and be hard to manage |
| 10 | 2026-10-23 | **Calm by default:** prominence P1–P5; P4 drawn faint ("whisper"), P5 not drawn (Folio/search only); hard density budgets with auto-demotion; optional layers off by default | Less important history should be quiet or hidden |
| 11 | 2026-10-23 | Rendering: Skia (CanvasKit) tiles in workers; benchmark against native canvas in Phase 0 | Identical text metrics, effects, one renderer for screen/print/video |
| 12 | 2026-10-23 | Paper texture is composited by the viewer on the GPU; tiles are transparent ink | Skia-in-wasm paper cost 45 ms/tile; ink-only tiles render in ~2 ms |
| 13 | 2026-10-23 | Custom deep-zoom viewer for the chart; OpenSeadragon kept for IIIF doorways | Frozen HUD, tile fallback and paper compositing were simpler with our own camera |
| 14 | 2026-10-23 | Lanes sit in **stable straight tracks**, assigned automatically from succession chains and relations; "flowing" tracks kept as an option only | Flowing tracks made lanes swing sideways and read as restless — the opposite of calm |
| 15 | 2026-10-23 | Placement order: words before pictures (P1–P2 labels, P1–P2 images, P3 labels, P3 images, P4 labels) | Images placed first crowded out key labels |
| 16 | 2026-10-23 | Cut-outs via Apple Vision subject lifting (Swift CLI); Met Open Access + Wikimedia Commons as first image sources; credits generated into docs/CREDITS.md | Clean masks on museum photos, no ML setup needed on this Mac |
| 17 | 2026-10-23 | Fonts are subset at build time to the characters the chart uses | 28 MB → ~1 MB |
| 18 | 2026-10-23 | Tracks are as wide as their widest lane plus the labels they actually carry | The classical world sheet went 77k → 51k units wide with no labels lost |
| 19 | 2026-10-23 | Threads (Silk Road, alphabet, writing, numerals, money) are optional layers, off by default | Calm first; journeys across regions on demand |
| 20 | 2026-10-23 | Atlas uses Cliopatria matched by hand-picked names, then exact names, then Wikidata IDs | Cliopatria tags "Roman Empire" with Byzantium's QID, so IDs alone mislink |
| 21 | 2026-10-23 | **Desktop only** (Mac / computer browsers). No phone or tablet layouts, no touch work, no iPad testing | Personal project used on a Mac |
| 22 | 2026-10-23 | **Progressive time scale** on the world sheet: ⅛ (10,000–3300 BCE), ½ (3300–1000 BCE), 1 (1000 BCE–1500 CE), 2 (1500–1800), 3 (1800–1900), 4 (1900–today); each change is marked. Supersedes the "equidistant" part of decision 2 | Equidistant squeezed 1500 → today into a sliver while the sparse Bronze Age took a third of the sheet |
| 23 | 2026-10-23 | The **left margin** carries era names, turning points (with coloured force chips) and era maps; the **right margin** carries climate ribbons and the world population curve (log scale) | Margins are context, so they stay out of the lanes' way |
| 24 | 2026-10-23 | Era maps are **ink-printed**: the pipeline turns darkness into sepia ink and light into transparency; photographs of Earth are inverted first | Tiles are transparent, so a true multiply onto the paper is impossible; this is mathematically the same look |
| 25 | 2026-10-23 | Phase 2 ships with ~1,400 events (the plan estimated ~2,500); the remaining fill moves to Phase 3, under the density budgets | Every region and era is covered end to end; quality and checks over raw count |
| 26 | 2026-10-23 | The world sheet is the default view (`?sheet=classical-world` still opens the slice) | The poster now exists end to end |
| 27 | 2026-10-23 | Commons downloads fall back to the 1920 px thumbnail when the original is throttled | Wikimedia rate-limits full-size originals hard; 1920 px is plenty for the chart |
| 28 | 2026-10-24 | **Minimum zoom = cover**: the sheet always fills the screen (no blank surround) and panning stops at the paper's edges. The opening view shows every region and as much time as fits, starting from the top | Zooming out past the paper only showed empty space; seeing all of time at once is not worth a postage-stamp chart |
| 29 | 2026-10-24 | **Lane minimum widths when zoomed out**: P1 lanes are drawn at least ~7 px wide on screen and P2 ~3.5 px, tapering to their true width as you zoom in. Drawing only; layout widths are unchanged | At the wall view a P1 lane was ~3.6 px, so the landmark empires read as threads. Wider layout lanes would widen the sheet and shrink the wall view again |
| 30 | 2026-10-24 | **Atmosphere layer**: faint ink-printed engravings (public domain, credited, `rights` kept) sit in the empty paper of each era × region at ~6–10% ink. Placed by the layout in free cells, never clickable, fading out by the century zoom. On by default, toggleable in Layers | Big open areas looked blank at the wall and era zooms; the labels that own that room only appear when zoomed in |
| 31 | 2026-10-24 | Atmosphere engravings carry **no prominence** and are exempt from the open-paper budget: they are paper decoration, like the substrates. Everything that carries information still needs P1–P5 | The prominence system governs content; decoration is governed by its fade and ink limits instead |
| 32 | 2026-10-24 | **Coverage targets** live in `content/coverage.yaml`: an era baseline per region × a region weight, with per-cell overrides only where the record is thin (each one commented). `pnpm coverage` is the Phase 3 gate, along with zero budget demotions | Targets keep Africa, the Americas, Asia and Oceania from being footnotes without inventing history where little is known |
| 33 | 2026-10-24 | **People** are their own content (`content/people/`), tied to a lane, P2–P5, drawn at the century zoom with a lifetime bar. Ids start with `p-`. Only people who have died | One person can matter to several events; a lifespan reads differently from an event; living people have no fixed span |
| 34 | 2026-10-24 | **Voices** are short (≤ ~25 words) primary-source quotations on P1–P2 lanes only, in italic. Plain modern renderings unless a public-domain translation is named | The plan's "voices, P2+ only"; short lines keep the canvas calm and stay clear of copyright |
| 35 | 2026-10-24 | **Daily-life cards** are Folio only: listed under their lane and found by search, never drawn | They are paragraphs, not labels |
| 36 | 2026-10-24 | **Coins** use a `coin` image treatment (lifted roundel with a soft shadow), preferring portraits struck in the ruler's lifetime | The plan's "embossed roundels"; a lifetime coin is the closest thing to a portrait from life |
| 37 | 2026-10-24 | The **Atlas is split per era** (halved where crowded) with an index; the viewer loads only the year on screen. Supersedes the single-file Atlas | 14 MB in one file was the biggest load on the page |
| 38 | 2026-10-24 | The build **fails on any native-name character no bundled font can draw** | A missing glyph prints as an empty box; Edo's 戸 was one |
| 39 | 2026-10-24 | **No narrated tours or tour videos** in the plan: Phase 4 is lenses, threads and Meanwhile; layers, print, offline and accessibility move to Phase 5. The two existing tours stay as they are | Rojan doesn't need guided camera flights; exploring by theme, story and year matters more |
| 40 | 2026-10-24 | **Engravings stay visible at every zoom** (no fade-out). Supersedes the fade in decision 30 | At 13% ink they never compete with labels, even fully zoomed in |
| 41 | 2026-10-24 | **Lenses** are content (`content/lenses.yaml`): each gathers themes; one lens at a time. When on, matching labels stay full, other labels drop to 13%, pictures 30%, lanes 45%, and every match gets a fixed-size dot in the lens colour | One theme should read across the whole chart, even from the wall view, without new layout |
| 42 | 2026-10-24 | **Threads** get their own menu and a follow-stop-by-stop mode; an event may sit on several threads (`threads: [...]`) | Buddhism, printing and paper share stops; following a story beats seeing a dashed line |
| 43 | 2026-10-24 | **Meanwhile** is computed in the browser from the Folio (entries carry astronomical `years`), with a window that widens in deep time (±250 → ±5 years) | Instant, no extra files, and the same window logic for any year |
