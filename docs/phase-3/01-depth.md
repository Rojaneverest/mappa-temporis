# Phase 3 — depth (2026-10-24)

Phase 3 fills the skeleton era by era, under the density budgets. Gate: **coverage targets met within density budgets**. `pnpm coverage` shows every era × region at or above its target, and the world sheet builds with **0 budget demotions**.

## Before the fill: the wall view
Rojan's review of the Phase 2 poster led to three changes (decisions 28–31):
- **The paper fills the screen.**
  - The furthest you can zoom out is "cover", and panning stops at the paper's edges.
  - At 1440×830 the opening view shows all nine regions, from 10,000 BCE to about 1600.
- **Landmark lanes keep a minimum width when zoomed out:** P1 lanes at least 7 px, P2 at least 3.5 px.
  - A centre stroke does this and fades once the lane itself is wider.
  - Only the drawing changes, not the layout.
- **The atmosphere layer.** 31 public-domain engravings sit in the open paper of their era and region.
  - The set runs from Tassili rock art, Giza, Karnak, Layard's Nimrud, Piranesi's Colosseum and Meroë, through Bayeux, Hagia Sophia, Chichén Itzá, Angkor and Rapa Nui, to Nova Reperta's printing shop, Benin City, Lorck's Constantinople, the Great Wave, Stephenson's locomotive, a Mark I tank and the Saturn V.
  - Each is cropped to the picture, ink-printed (paper cut hard, so no grey plate shows) and feathered at the edges.
  - The builder places each in the emptiest spot of its span, using a summed-area occupancy table.
  - They print at 13% ink and fade out before the century zoom.
  - Layers → "Engravings of each age" turns them off. Credits are in `docs/CREDITS.md`.

## Content
- **Events: 1,419 → 1,836.**
  - By region: Africa 195 · Americas 200 · East Asia 268 · Europe 311 · Near East 307 · Oceania 87 · South Asia 181 · Southeast Asia 143 · Steppe 144.
  - **Targets** (`content/coverage.yaml`): each era has a baseline per region, scaled by a region weight. Eleven cells have documented overrides where the record is thin, such as Oceania in Classical Antiquity (the Polynesian "Long Pause") and Africa in the Early Bronze Age.
  - **35 duplicates merged**, such as the Nakba twice in the Israel lane and the Maccabean revolt in two lanes. Some came from Phase 1–2, some from this fill.
- **New lanes (12):**
  - The Atlantic slave trade, Oyo, Dahomey, Merina & Madagascar, Oman's Zanzibar, Sennar & Sudan.
  - Syria & Lebanon, Durrani Empire & Afghanistan.
  - Archaeology lanes: Sahel & forest-edge farmers (to Jenne-Jeno), East African herders, Steppe Eneolithic (Khvalynsk to Maikop), Deer stones & khirigsuurs.
  - Total: 386 lanes.
- **People: 241** (`content/people/<region>.yaml`).
  - Drawn at the century zoom with their lifespan and a thin lifetime bar beside the lane.
  - Each has a Folio card listing the events that name them.
  - Ids carry a `p-` prefix. Living people are left out, since every entry needs a death date.
- **Voices: 91** (`content/voices.yaml`).
  - Short primary-source lines on landmark (P1–P2) lanes, set in italic, from Ptahhotep and Hammurabi to the Gettysburg Address and Armstrong on the Moon.
  - Ancient texts are given in plain modern English unless a public-domain translation is named (L. W. King for Hammurabi, FitzGerald for Khayyam).
- **Daily life: 36 cards** (`content/daily-life.yaml`).
  - Folio only: rooftop life at Çatalhöyük, the tomb-builders' strike at Deir el-Medina, Roman insulae, the mit'a, Edo townsmen, the pass book, Polynesian wayfinding…
- **Coins: 17 roundels**, a new `coin` treatment: lifted from the photo, with a soft shadow.
  - Mostly lifetime portraits: Caesar 44 BCE, Augustus, Cleopatra VII, Kanishka, Chandragupta II, Justinian, Charlemagne.
  - Also Croesus's stater, the Athenian owl, Ban Liang, Kaiyuan Tongbao, the standing-caliph dinar, Ezana's cross, Jahangir's mohur, a Potosí piece of eight and a Venetian ducat.
- **Native names: 102 more lanes** (198 in all), in Arabic, Persian, cuneiform, hieroglyphs, Old Persian, Brahmi, Devanagari, Tamil, Sinhala, Greek, Cyrillic, CJK and others, plus a few people (Confucius, Ashoka, Cyrus, Muhammad, Sejong, Murasaki, Genghis Khan).

## Engine and tools
- The label placer now takes events, people (with lifetime bars) and voices (caption face). All three share the collision grid and the density budgets.
- **Lint additions:**
  - every native-name character needs a glyph in our fonts (it caught Edo's 戸 straight away);
  - people must be alive at the events that name them;
  - voices only on P1–P2 lanes, at most 26 words;
  - no lifetime longer than 110 years;
  - unique ids across lanes, events, images, people, voices and cards.
- **Atlas:** one TopoJSON per era, halved where crowded, plus an index (`world.atlas.json`). The viewer fetches only the file for the year on screen. Largest file 953 KB (it was 14 MB in one go).
- **Tools:**
  - `pnpm coverage`: matrix, people/voices/daily/coins per region, duplicate check within and across lanes;
  - `scripts/add-events.ts` (`--images` for images): inserts flow lines without reformatting;
  - `scripts/remove-events.ts`;
  - `scripts/events-list.ts` and `scripts/lanes-list.ts`, for writing without duplicating.

## Checks
- `pnpm typecheck`, `pnpm test` (21 tests), the content lint and all three sheet builds pass.
- In the browser (Built-in pane, desktop):
  - cover zoom and pan limits;
  - the wall view with engravings;
  - Athens at ×22 and ×70: people, lifetime bar, voices, the owl coin;
  - Folio for a person and for a lane (People, Voices, Daily life sections);
  - search reaching a daily-life card;
  - the Atlas loading era files;
  - no console errors.

## Known gaps → Phase 4 and later
- **The plan's full-v1 numbers** (about 800 people drawn, 300 voices, 80 daily-life cards, about 1,000 images) are not reached. Phase 3 ships 241 people, 91 voices, 36 cards and 17 coins. Growing them is ongoing curation, now cheap with the tools above.
- **Engravings:** 31 across the eras. Contemporary-era and Steppe classical pieces are thin, and some candidates were dropped for bad scans.
- **Content review:** everything Claude drafted in this phase needs Rojan's review (decision 6). That covers the new events, people's dates, the wording of voices and the daily-life texts.
- **The Kaiyuan coin's square hole** shows the photo's dark background; a manual mask would fix it.
