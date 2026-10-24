# The War & conquest lens (2026-10-24)

Decision 59. Branch `phase-5/lenses`. Rojan's changes to the plan (`05-lenses-plan.md`): no lens guide, war only for now, and tap detail that answers **why it was fought** and **what it changed**.

## Performance and dots (first)
- Lens tiles render in 8 ms, as without a lens (they took 19 ms). Dimmed text now bakes its alpha into cached paragraphs instead of compositing a layer per label.
- The page downloads the chart and fonts once and hands them to the tile workers.
- Lens dots are 3.6 px (half that at the wall view) and fade out by the era zoom, where labels and pictures take over.

## What the lens does
- **The chart steps back.**
  - Lanes the lens touches (their P1–P3 war events, or a part in a conflict or arrow) keep their colour.
  - The others recede to a solid grey-paper tint (`alt` on lane items; the painter swaps the colour).
  - Ordinary pictures and engravings are hidden, and non-war labels fade as before.
- **The lens comes forward**, on its own `lens:war` layer, placed by a second layout pass. That pass starts from the chart's structure (lanes, branches, arrows, era rules) plus the war labels, so it can use the room the hidden and faded things leave.
  - **36 conflicts:**
    - Drawn as soft bands across the lanes involved, named in spaced capitals inside or just beside the band. Names stack word by word to fit between lanes.
    - They run from Egypt against the Hittites to the Cold War, including the Greco-Persian and Peloponnesian wars, Alexander, the Warring States, the Punic wars, Han against the Xiongnu, the Arab conquests, the Crusades, the Mongols, the Hundred Years' War, the Spanish conquest of the Americas, the Thirty Years' War, the Napoleonic wars, the Opium wars, the Taiping, the conquest of Africa, and both World Wars.
  - **Conquest arrows:**
    - 30 new ones, from Sargon over Sumer to the Soviet invasion of Afghanistan.
    - Plus the chart's own conquests that were too long to draw (up to 30,000 units under the lens).
    - Captions show unless an event on either lane already tells that moment.
  - **34 war pictures**, from the Narmer Palette and the Standard of Ur, through the Alexander Mosaic, Bayeux, Rashid al-Din's Mongols, Nagashino and Goya, to Chateau Wood and Nagasaki.
  - **12 turning-point cards**, each a picture, a title and a line: the chariot, iron, the crossbow, the stirrup, Greek fire, gunpowder, the siege cannon, the star fort, musket and drill, the machine gun, war in the air, and the atomic bomb.
- **Tap.** The Folio shows **Why it was fought** (or **Why it came about**, for turning points), **What it changed**, and for conflicts the sides and **Who was involved**, with links to each lane.
  - Notes cover 36 conflicts, 12 turning points and 37 key battles and events already on the chart (Kadesh, Marathon, Gaugamela, Kalinga, Hastings, Manzikert, Ain Jalut, Constantinople, Cajamarca, Plassey, Waterloo, Adwa, Tsushima, Sarajevo, Stalingrad, Hiroshima…).
  - The notes show whether or not the lens is on.

## Content and checks
- Everything is in `content/lenses/war.yaml`, drafted by Claude and awaiting Rojan's review (decision 6).
- Pictures come from Wikimedia Commons, with each licence checked at search time and credits regenerated in `docs/CREDITS.md`.
- The crossbow trigger is shown as a plate, because its cut-out found no subject.
- The build fails on any lens id that doesn't exist: lanes, events, pictures.
- World sheet: 36 conflicts, all 46 pictures and cards placed, 37 notes.

## Verified
- Typecheck, tests and all three sheet builds pass.
- In the dev server (driving frames by hand, since the pane runs in the background):
  - bands, names, arrows and pictures under the lens at the wall, era and century zooms;
  - lanes receding;
  - the Folio for a conflict, an event note and a card.
- A lesson from testing: changing only the `#` doesn't reload the page. Reload after each build to see it.
