# Lenses that draw you in — plan (draft, 2026-10-24)

Scope: **War & conquest** and **Power & government** first. Nothing here is built yet, except the two fixes at the end.

## What's wrong today
A lens only dims things. Matching labels stay full, other labels drop to 13%, pictures to 30% and lanes to 45%, and every matching event gets a dot. The result is a faded chart with red dots: nothing new appears, the lanes lose their shapes, and the only reward for zooming in is text.

A lens should feel like **an exhibition hung over the poster**: the chart steps back but stays legible, and the theme comes forward with its own pictures, lines and stories.

## The idea, by zoom level
| Zoom | Under a lens you see |
|---|---|
| **Wall** | The chart in quiet grey-paper tones. The lens's **big structures** in colour: the great wars as bands across the lanes they engulfed (war), or every state coloured by its form of government (power). A handful of hero pictures for the theme. Small dots only. |
| **Era** | The lens's **pictures** where the other pictures were: battle reliefs, armour, siege engines, crowns, seals, law codes. Lens labels at full strength, conquest arrows and treaty lines with captions, and the lanes involved in full colour. |
| **Century** | **Story cards** for the lens's turning points (a picture, a title and two sentences), plus the people of the theme (generals, lawgivers, rulers). |
| **Tap** | The Folio opens on the lens's own section for that thing ("How it was fought", "How it was governed"), linking to related moments elsewhere in time. |

## What changes when a lens is on (both lenses)
1. **The chart recedes, it doesn't vanish.**
   - Lanes the lens touches stay in full colour. Every other lane becomes a solid, desaturated paper tint, not a transparent one, so shapes and forks still read.
   - Non-lens labels are greeked or very faint, as now.
2. **Pictures are swapped, not dimmed.**
   - Ordinary pictures and engravings are hidden under a lens.
   - The lens's own pictures are placed into the room they leave, by a **second layout pass per lens at build time**. That pass sees the lanes and the lens's labels as obstacles and treats everything else as free paper.
   - The default chart is untouched: lens items live on their own `lens:<id>` layer.
3. **Lens lines.**
   - War: conquest and invasion arrows, campaign routes and conflict bands, all with captions.
   - Power: treaty lines joining signatories, plus emphasised splits, unifications and successions.
   - These replace "find the dot".
4. **A lens guide.** Turning a lens on opens a short introduction in the Folio and its **turning points** (about 12), each of which flies to its place. The chip keeps the count and an ×.
5. **Dots** only at the wall and overview, fading out by the era zoom, where labels and pictures take over.

## War & conquest — content
- **Conflicts**, about 40 (new content type): the great wars as bands spanning the lanes they involved, with dates, sides, outcome and sources.
  - Examples: the Kadesh campaign, the Peloponnesian War, the Punic Wars, the Warring States, the Three Kingdoms war, the Arab conquests, the Crusades, the Mongol conquests, the Hundred Years' War, the Ōnin War, the Thirty Years' War, the Seven Years' War, the Napoleonic Wars, the Taiping Rebellion, the Scramble for Africa, and both World Wars.
  - Drawn as a soft red band across the involved lanes, named in spaced caps.
- **More arrows**: about 30 more conquests and invasions with captions, alongside the 32 we have. Under a lens, captions show even when an event tells the same story.
- **Pictures**, about 60, through `pnpm images` (Met, Commons and the British Museum).
  - Ancient: the Standard of Ur war panel, the Narmer Palette, the Stele of the Vultures, Assyrian siege reliefs, a hoplite helmet, the Terracotta Army, Trajan's Column.
  - Medieval to early modern: Bayeux, Mongol cavalry from the Jami' al-tawarikh, a samurai yoroi, an Aztec eagle warrior, Ottoman cannon.
  - Modern: Napoleon, Goya, the Western Front, Hiroshima.
  - Each one is tagged `lenses: [war]` and anchored to a lane and date.
- **Turning points**, about 12 story cards: the chariot, iron, cavalry and the stirrup, Greek fire, the trebuchet, gunpowder, the bastion fort, the musket and drill, the railway and telegraph, the machine gun, air power, and nuclear weapons.
- **Folio "How it was fought"** for P1–P2 war events: armies, weapons, outcome and what it changed. Written short and sourced.

## Power & government — content
- **Form of government on every state lane** (the biggest job, and what makes this lens draw you in).
  - A `government` field per lane segment: chiefdom or confederation, city-state, monarchy, empire, theocracy, republic or oligarchy, democracy, colonial rule, one-party state, or federal republic.
  - Under the lens, lanes are **recoloured by form**, with a small legend in the chip. Rome turning from monarchy to republic to empire, or Europe turning republican after 1789, becomes visible at the wall.
  - About 250 polity lanes; I draft, you review.
- **Treaties and alliances**, about 25, as lines joining their signatories: Kadesh (the first recorded peace treaty), the Peace of Callias, Tordesillas, Westphalia, Utrecht, Vienna, Versailles, the UN Charter and others.
- **Pictures**, about 50: the Code of Hammurabi stele, the Cyrus Cylinder, an Ashoka edict pillar, ruler coins, an imperial seal, Magna Carta, the Forbidden City throne, Versailles, the Declaration of Independence, the Declaration of the Rights of Man, Meiji in uniform, a ballot box.
- **Turning points**, about 12 story cards: the first kings, written law, empire, democracy, the republic, the bureaucracy and the exam, divine right, constitutions, revolution, the nation-state, decolonisation, and universal suffrage.
- **Folio "How it was governed"** for P1–P2 lanes: who ruled, how power passed, and what law was.

## Build order
| Step | What | Done when |
|---|---|---|
| **L1. Engine** | Lens-only items; the second, per-lens layout pass; receding lane tints; pictures swapped; dots fade by the era zoom; the lens guide in the Folio; schema for `lenses:` on images, `conflicts`, `treaties`, `government`. Tested with existing content tagged | Switching a lens visibly swaps pictures and recolours lanes, and nothing changes with the lens off |
| **L2. War** | Conflicts, more arrows, about 60 pictures, 12 cards, Folio sections | The war lens at the era view shows 8 or more lens pictures and its bands and arrows |
| **L3. Power** | Government forms on about 250 lanes, about 25 treaties, about 50 pictures, 12 cards, Folio sections | Recolouring reads at the wall; treaty lines appear at the era view |
| **L4. Review** | Your review of the drafted content; a performance check | — |

Performance stays within today's budgets. Lens items only draw while their lens is on, and lens tiles now render as fast as normal ones (below).

## Decisions to confirm
1. **Pictures under a lens are hidden** (not just faded), and the lens's own pictures take their place. My recommendation: yes.
2. **Other lanes recede as a solid grey-paper tint** rather than see-through. My recommendation: yes; it keeps the poster's structure.
3. **Power recolours lanes by form of government.** This is the most striking effect but also the largest data job. I'd build it, after the war lens.
4. **Detail on tap goes in the Folio**, with only short captions and story cards on the map. My recommendation: yes; the map stays a picture, not a page.

## Already done (this turn, branch `phase-5/lenses`)
- **Lens switching is faster.** Dimmed labels were each drawn through their own offscreen layer. Their transparency is now baked into the cached text instead, so lens tiles render in 8 ms (they took 19 ms), the same as with no lens, with no visual change.
- **First load is lighter.** The page downloads the chart (3.5 MB) and fonts (about 3 MB) once and hands copies to the four tile workers. Before, each worker downloaded its own.
- **Lens dots** are smaller (3.6 px, from 4.5) and about half that at the wall view.
