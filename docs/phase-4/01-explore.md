# Phase 4 — explore: lenses, threads, Meanwhile (2026-10-24)

Rojan narrowed Phase 4 to three ways of exploring the chart (decision 39). Narrated tours and tour videos are out of the plan; optional layers, print, offline and accessibility move to Phase 5. Also: the atmosphere engravings now stay visible at every zoom (decision 40).

## The toolbar
One row: **Layers · Lenses · Threads · Meanwhile · Atlas · Search · Tours**. Each menu opens under its own button, and opening one closes the others. Keys: **K** lenses, **T** threads, **Y** Meanwhile, **L** layers, **A** Atlas.

## Lenses (`content/lenses.yaml`)
- **Ten lenses:** Faith & belief, Science & technology, Art & literature, Ideas & learning, War & conquest, Power & government, Trade & exploration, Migration, Climate & disease, Women in history.
- **What gets lit:** a lens gathers every event, person and voice whose `themes` include any of its themes.
  - People's themes were derived once from their roles and written into `content/people/*.yaml` as reviewable content.
  - Voices were tagged by hand.
- **What happens when one is on:**
  - Matching labels stay at full strength. Other labels drop to 13%, pictures to 30%, lanes to 45%.
  - Each match gets a 4.5 px dot in the lens colour on its lane's edge, so a lens reads as a constellation even at the wall view.
  - A chip in the toolbar names the lens and its count; × turns it off.
- **How it's built:** marks carry `lk` (label, lane or image) and `lens` (ids). The painter reads the active lens from the layer set (`lens:<id>`), so changing lens just redraws tiles. Dots are fixed-size circles in CSS pixels (a new `dot` field on rect items).
- **Counts on the world sheet:** Faith 243 · Science 238 · Art 280 · Ideas 165 · War 494 · Power 523 · Trade 192 · Migration 97 · Climate & disease 69 · Women 97.

## Threads (`content/threads.yaml`)
- **Thirteen threads.** New ones:
  - Buddhism's journey (26 stops);
  - the Columbian Exchange (8);
  - Gunpowder (12);
  - Printing (8);
  - Pandemics (12);
  - The horse (11).

  Calendars grew from 3 to 8 stops: the Egyptian civil calendar, the Julian and Gregorian reforms, the Taichu calendar and the Hijra were added.
- **Data changes:**
  - An event can sit on several threads (`threads: [...]`) as well as the old single `thread:`.
  - Every thread has a one-line note.
  - The lint checks thread ids.
- **The Threads menu** (its own button now; it used to sit inside Layers): tick a thread to draw it, or press **▶** to follow it.
- **Following:** the camera flies to the first stop, and the panel shows a bar with "Buddhism's journey · 4 / 26 ◀ ▶ ×". Each step flies to the next stop. A thread's own Folio card has a "Follow this thread" button.

## Meanwhile (`apps/explorer/src/meanwhile.ts`)
- **Three ways in:**
  - click any year on the ruler;
  - press **Y** (the year under the cursor);
  - press the Meanwhile button (the year in the middle of the screen).
- **What it shows**, region by region:
  - the states and peoples alive (landmarks in bold);
  - events within a window, including those too minor to be drawn;
  - people alive, with their age;
  - voices from that time;
  - daily-life cards.
- **The window** widens in deep time and narrows in the crowded centuries: ±250, 50, 25, 15, 10 and 5 years. Years are rounded the way they read (150 BCE, not 151 BCE). ◀ ▶ steps by one window.
- **Deep link:** `#…&s=meanwhile:1450`.
- **Data:** Folio entries now carry `years: [from, to]` as astronomical years. Meanwhile is computed in the browser and costs nothing until opened.

## Smaller changes
- The chart files are fetched with `cache: 'no-cache'`. A rebuild was otherwise hidden behind the browser's cached copy (that is how the first lens dots went missing in testing).
- Removed a duplicate Hyksos event (two stories about the horse and chariot reaching Egypt).

## Checks
- `pnpm typecheck`, `pnpm test` (21) and all three sheet builds pass. The build fails on unknown thread ids.
- In the browser (desktop):
  - a lens at the wall view (purple constellation for Faith & belief) and at the century zoom (the Buddha and Mahavira bright, the rest dimmed), and the chip × turning it off;
  - the Threads menu, following Buddhism through 4 stops with the thread drawn;
  - Meanwhile from the ruler (around 150 BCE), from a deep link (1450) and stepping to 1465;
  - engravings visible at ×25;
  - no console errors.

## Known gaps
- Some stories are told twice across regions and show up together in Meanwhile, for example Zhang Qian's journey (Steppe and East Asia). The duplicate check only compares lanes within one region.
- Lens themes come from the content. Any event without themes (about 13%) never lights up.
