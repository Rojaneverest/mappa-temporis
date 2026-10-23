# Phase 2 — the skeleton: the whole poster, end to end (2026-10-23)

The world sheet (`content/sheets/world.yaml`) now runs from the first farmers (10,000 BCE) to today, across all nine regions. It is the default view; `?sheet=classical-world` still opens the Phase 1 slice.

## Content
- **374 lanes, 1,419 events.** Every region has a prologue (`*/ancient.yaml`), its classical lanes (Phase 1), and `*/later.yaml` running from about 700 CE to today. Later events were also added to the long-lived Phase 1 lanes (Byzantium, the Maya, Tang, Champa…).
  - The plan estimated ~2,500 events. The skeleton ships at ~1,400 with every era × region covered, and the rest of the fill moves to Phase 3 (decision 25).
  - By region: Africa 139 · Americas 179 · East Asia 211 · Europe 302 · Near East 213 · Oceania 49 · South Asia 155 · Southeast Asia 80 · Steppe 91.
- **Nepal**, as promised, is a lane chain: Licchavis → Kathmandu Valley kingdoms → Nepal. It covers Changu Narayan, Araniko, the Gorkha unification, Bhimsen Thapa, the 1814–16 war, the Ranas, Everest 1953, and the 2008 republic.
- **Native scripts:** added Devanagari, Hangul, Thai, Khmer, Burmese, Tibetan, Gurmukhi, Bengali, Tamil and Sinhala (Noto; subset per sheet, 2.5 MB in total).
- **Images:** ~40 landmark photographs (Giza, Göbekli Tepe, Stonehenge, Mohenjo-daro, the Terracotta Army, Angkor Wat, Borobudur, Machu Picchu, Great Zimbabwe, Lalibela, the Forbidden City, the Taj Mahal, the Great Wave, the Mona Lisa, the moai, Earthrise…).

## The frame
- **Progressive time scale** (decision 22). The sheet uses ⅛ of the main scale before 3300 BCE, ½ to 1000 BCE, the main scale to 1500 CE, then 2×, 3× and 4× for the crowded recent centuries.
  - Every change is a zig-zag rule with a note in the left margin.
  - The viewer's ruler picks its tick steps per stretch, so the compressed prologue no longer piles its labels on top of each other.
- **Era substrates.** Each era tints the paper very faintly, from the green earth of the Neolithic and bronze, through iron, marble, vellum, sea-blue and soot, to the white of today. Neighbouring eras cross-fade over a feathered seam.
- **Turning points.** Each hinge is a shaded band with hairline edges. In the left margin it is named, with coloured chips for the forces at work (climate, migration, disease, war, technology, ideas). Clicking it opens the era in the Folio, with a note and sources.
- **Era maps: "the world as they saw it."** Under each turning point, an ink-printed world map from its era:
  - the Ga-Sur tablet and the Turin Papyrus;
  - the Babylonian Map of the World;
  - Ptolemy, Ulm 1482;
  - al-Idrisi's Tabula Rogeriana;
  - Ricci's Kunyu Wanguo Quantu;
  - the Imperial Federation map of 1886;
  - the Blue Marble;
  - the Earth at night.

  The pipeline turns darkness into sepia ink and light into transparency (decision 24).
- **Margins** (right; `content/margins.yaml`):
  - **Climate:** 13 sourced episodes as coloured ribbons (warm / cold / dry / wet), from the end of the Younger Dryas to modern warming.
  - **People:** world population on a log scale (4 million → 8 billion), with callouts such as the Black Death dip and each new billion.
  - Both open in the Folio.

## Explorer
- New Folio kinds: *Era*, *Climate*, *People* (notes and force chips in the panel; searchable).
- New tour: **Twelve Thousand Years in Six Ages** — 19 stops, from Göbekli Tepe to the Moon.
- World Atlas: 13,797 Cliopatria shapes, 251 of 374 lanes linked (`pnpm atlas`).
- Frozen region headers fall back to short names ("Near East", "SE Asia") when the full name won't fit.

## Checks
- `pnpm typecheck`, `pnpm test` (20 tests) and the content lint (dates inside spans, unique ids, relations, tour targets) all pass.
- Checked in the browser (desktop): world sheet loads, Folio panels for margins and eras, tours menu, ruler.
- Checked in offline renders: margins, turning points, era maps, the 19th-century scale.

## Known gaps → Phase 3
- The world Atlas file is 14 MB, mostly per-shape arc references from Cliopatria's time slices. It's fine on localhost; a per-era split or a binary format would shrink it.
- Event density still varies: Europe has more than Oceania or Southeast Asia. Phase 3's balance audit and fill take this on.
