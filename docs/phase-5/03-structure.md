# Phase 5c — structure between lanes (2026-10-24)

Decisions 56–57. Branch `phase-5/richness`.

## Branches
- **Shape.** A split, a succession or a merge between two columns is drawn the way the poster draws its forks:
  - a bar leaves the end of the earlier lane;
  - it turns a 45° corner;
  - it drops into the top of the later lane.

  The branch is as wide as the narrower of the two lanes, in the later lane's colour, and sits under the lanes. Its outline is made at build time by stroking the centre line with Skia (`makeStroked`, round joins).
- **Long branches.** Anything wider than 6,000 units stays a thin thread that appears up close (for example the Mongols to the Yuan, which sit in another region).
- **Splits continue the main line.** A split carries its column into the weightiest, longest-lived successor, and successions may cross groups within a region. Results:
  - Rome now runs straight into Byzantium, and the Western Empire branches off;
  - the Umayyads continue as the Abbasids;
  - Han splits into the Three Kingdoms;
  - the Germanic peoples fork into Franks and Visigoths;
  - the Carolingians fork into France and the Holy Roman Empire.
- **Column order follows relations.** Related columns pull together (220 per weight per position apart), and relations to another region pull a column towards the facing edge (140 per weight per position). Columns may now move across groups.
- **Arrows.**
  - Conquest, influence and merge arrows are thicker, with larger heads.
  - Their 44 relations now carry a short `label` ("Cyrus takes Babylon", "Saladin takes Jerusalem").
  - A label is drawn above the arrow near its head when it fits, and only when no P1–P3 event on either lane within 5 years already tells that moment. Most famous conquests already have such an event, so about a dozen labels show.

## Width follows territory
- `scripts/atlas/power.ts` reads the committed Atlas files and sums each lane's Cliopatria area every 10 years into `content/power.json`. That covers 251 lanes, for example Rome peaking at 5.2M km² around 120 CE and the Mongols at 27.5M around 1280. `pnpm atlas` regenerates it.
- **Width over time.** P1–P3 lanes are full width at their own peak and never below 40% of it, smoothed over ±20 years. Peaks are scaled 0.8–1.15× by size, so the largest empires are a little wider than modest kingdoms.
- **Wider landmark lanes.** P1 is now 620 units (it was 480) and P2 300 (it was 260), so the main empires read as bars from further out.

## Numbers (world sheet)
- **Sheet width:** 96,679 → 104,510 units. The cost comes from wider landmark lanes and related columns pulled together.
- **Era view:** 42 readable labels, 4 pictures, 68% open. That's unchanged, since 5c adds structure rather than labels.
- **Labels without room:** P1 0, P2 12, P3 130, P4 103, down from 1 / 18 / 147 / 136, because lanes are thinner in their weak years.
- **Display list:** 3.0 → 3.5 MB (the swelling outlines have more points).
