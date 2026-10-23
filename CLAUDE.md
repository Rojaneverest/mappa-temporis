# Mappa Temporis

A deep-zoom atlas of world history (UsefulCharts-style, much larger, calm by default).

- The master plan is `docs/PLAN.md`; locked decisions are in `docs/DECISIONS.md`. Read both before changing direction, and log new decisions there.
- Personal, non-commercial project: any openly viewable image source is allowed, but every image keeps a credit and a `rights` field.
- "Calm by default": every item has a prominence P1–P5; P4 is drawn faint, P5 is not drawn. Never add canvas content without a prominence.
- Dates are written human-style in YAML ("c. 138 BCE", "202 BCE – 220 CE") and stored as astronomical years (1 BCE = 0). Use `packages/core/src/dates.ts`; never do BCE arithmetic by hand.
- Run `pnpm build:chart` to compile `content/` into the display list, `pnpm dev` to open the explorer, `pnpm test` for unit tests.
