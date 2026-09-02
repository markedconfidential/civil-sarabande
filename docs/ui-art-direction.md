# Civil Sarabande — UI/UX Identity & Asset Plan

## Context

Civil Sarabande is an on-chain reimagining of Jason Rohrer's *Cordial Minuet* — a two-player magic-square bluffing game. The web app (SvelteKit) already has a respectable dark burgundy/gold CSS theme (`packages/web/src/app.css`) and a fully wired game flow (`packages/web/src/routes/game/[id]/+page.svelte`, ~1000 lines), but it reads as a *generic dark dashboard*, not a game with a soul. Every visual element — board, coins, numerals, buttons, phase transitions — is CSS rectangles and system fonts. No images, SVGs, sprites, or audio are used anywhere.

The original's identity lived in its **hand-drawn materiality**: parchment, ink, watercolor bleeds, Hebrew-style numerals, color-coded player strokes. That materiality did narrative work — it made a math game feel like a ritual. This plan decides what custom assets to create so the UI feels unique and load-bearing for the gameplay, and pairs each asset with the UI moment it enables.

## Guiding Design Direction

**"Watercolor + 16/32-bit JRPG sprite."** A painted watercolor surface (parchment, washes, bleed edges) crossed with Final Fantasy–era 2D sprite craft — Yoshitaka Amano watercolor backgrounds meeting *FFVI / FF Tactics / Tactics Ogre* pixel-painted characters and UI. Chunky, readable sprites sit on soft painted backgrounds; UI panels are crisp pixel-framed windows over watercolor. On-chain moments become **JRPG menu windows and spell-cast sequences** rather than Web3 modals.

Core rules this direction implies:

- **Two rendering layers.** Background: watercolor, painted, analog, soft. Foreground: 2D sprites — crisp, pixel-snapped, high-contrast outlines, limited palette. The tension between them *is* the aesthetic.
- **Pixel-scale discipline.** Pick one base sprite scale (recommend 2× with `image-rendering: pixelated`, so a 64px sprite renders at 128px) and use it everywhere. Mixing scales is what kills retro pixel UIs.
- **Framed windows, not floating cards.** Action panels become bordered JRPG windows (ink-blue or parchment-brown) with corner flourishes, replacing the current rounded CSS cards.
- **Sprite-driven feedback.** Every meaningful action emits a sprite: coin plink, cursor tick, spell flash on reveal, floating damage numbers on scoring.
- **Numerals are custom suited glyphs** — each of 1–36 a unique hand-drawn character, designed as a pixel sprite with a watercolor wash behind it.

Why this fits this game: JRPG UI language already has a grammar for rounds, menus, turns, reveals, damage numbers, and victory screens — a perfect fit for a turn-based bluffing game. Sprite work is parallelizable (sigil, number, coin, cursor can each be produced in isolation), which de-risks the asset timeline. The existing dark/gold palette still works as the background wash color story.

## Asset Brief (prioritized)

### Tier 0 — Signature identity (commission first)

These are what a screenshot of the game is built around.

1. **Watercolor board surface + painted backgrounds.** One board-sized watercolor wash (warm parchment, cool ink bleed at corners) plus 3 large painted "location" backgrounds: lobby hall, duel chamber, settlement/vault. Painted loosely, ~2048px wide, no sprites baked in.
2. **Inked 6×6 grid overlay sprite.** A single high-res sprite layered over the watercolor board: hand-drawn irregular ink lines, corner sigil, gutter ornaments. Replaces the current `<table>` borders in `.board`.
3. **Suited numeral glyph set 1–36.** Each value gets a unique character, designed as a 48×48 or 64×64 pixel sprite with a painted wash backing. Delivered as a sprite sheet + JSON positioning metadata. **The single highest-leverage asset** — players stare at these every second of every match.
4. **Watercolor selection strokes.** Animated player-color washes that paint in when a column/row is chosen. 6 variants (H/V × 3 shapes), two palettes (You / Opponent). Short WebM loops or SVG path-draw animations. This is the feedback for the game's core action.
5. **Player sigil sprite library (12–24).** JRPG-style emblems: tarot-ish painted portraits with sprite-crisp borders. Assigned deterministically from wallet address so every opponent has a distinct "face"; players can optionally pick their own. Used on player cards and round-result stamps.
6. **Coin / chip / pot sprite set.** Single coin, 10-stack, 100-stack, and an animated "pot chest" that fills as bets escalate. Small idle shimmer per FF convention. Replaces the numeric `.player-coins` / `.pot-value`.
7. **Cursor / selection sprite.** A JRPG pointer with an idle bob for column/row picking. Doubles as tutorial pointer and hover affordance.

### Tier 1 — Signature moments (these make screenshots)

8. **Reveal-phase "spell cast" sequence.** A 12–20 frame sprite animation when both players commit their reveal: both sigils flash, watercolor streaks cross the board, chosen columns bloom, numbers tick into place.
9. **Damage-number sprites.** JRPG floating score numbers (outlined sprite font, rise-and-fade). Used for per-cell scoring at reveal and round-end totals. Two palettes for You/Opponent.
10. **Round-result crest.** A painted emblem that stamps on at round end with a wax-seal animation: "ROUND 3 — YOU WON +17" with the winner's sigil.
11. **Game-over composition.** Full-page painted duel-aftermath tableau (victory / defeat / tie), the two player sigils foregrounded as sprites, final score ribbon.
12. **On-chain wax-seal badges.** 4 states (pending / stamping / sealed / released) as small sprite animations, transaction hash engraved into the seal. Replaces every "Waiting for confirmation" spinner wherever `contract.ts` awaits a tx.

### Tier 2 — UI chrome (cheaper, big polish return)

13. **JRPG window 9-slice set.** 3 variants: parchment-brown (primary), ink-blue (menus/modals), blood-red (danger/fold). Pixel-crisp corners, subtly painted interior.
14. **Sprite font for UI numerals and small labels.** A pixel font for timers, coin counts, bet amounts (distinct from the hero suited glyphs). Bespoke 8×16 or licensed.
15. **Display/body font pairing.** Current Cinzel + Crimson Text is a fine placeholder; consider a more distinctive display face for painted headings that pairs with the pixel UI font.
16. **Ornamental corners, dividers, flourishes.** Ink-drawn accents that read at sprite scale.
17. **Loading / opponent-thinking sprite.** 4-frame animation (FF-style "…" bubble or pensive sigil idle). Ports the original's 3-frame loading cadence into sprite idiom.
18. **Icon set as sprites.** Wallet, coin, timer, history, fold, check/call/raise, leave — 16×16 or 24×24 pixel sprites, not Feather/Heroicons.

### Tier 3 — Atmosphere

19. **Ambient watercolor breathing** behind the board (WebM/SVG loop).
20. **Sound design (10–14 cues, JRPG-leaning).** Menu-open chime, cursor tick, sprite flash on commit, spell-cast swell on reveal, coin clink on bets, victory stinger, defeat tone, seal-stamp on tx confirmation, ambient chamber loop. Maps onto the original's `chime / chipSmall / chipBig / chipRake` taxonomy.
21. **Music (3 loops, 60–90s).** Lobby, duel, settlement. Hybrid orchestra + chip, Sakimoto *FF Tactics* register. Can start royalty-free.
22. **Mobile haptics** paired with key confirmation sounds via `navigator.vibrate`.

### Tier 4 — Brand

23. **Wordmark + monogram.** Painted display logo with a sprite-mark companion for favicon, lobby header, share/OG image.
24. **Share card templates.** End-of-game share image with result crest and final score, generated server-side in the sprite-on-watercolor layout.

## Art bible (do this first)

Before commissioning anything, produce one reference sheet: sprite scale (e.g. 2×), palette (8–16 colors), watercolor texture sample, one sample suited glyph, one sample JRPG window, one sample sigil. Every asset afterward is QA'd against this sheet. It is cheap and prevents style drift.

**Status: done.** The written spec is `docs/art-bible.md`; the living specimen page is `/design` in the web app.

## Engineering work that needs no new art (run in parallel)

- **Unify onboarding/funding pages with the theme.** `routes/onboarding/+page.svelte` and `routes/funding/+page.svelte` use off-palette colors (`#7c3aed`, `#666`); migrate to `app.css` variables.
- **Split the game page into phase components** (`BettingPanel`, `MovePanel`, `RevealPanel`, `PlayerCard`, `Board`, `Pot`). Prerequisite for slotting assets in cleanly.
- **Animate phase transitions.** ~10 phases per round with no motion between them; even 150ms cross-fades transform perceived quality.
- **`Number` component** wrapping the suited-glyph asset, so board/score/pot numbers share one render path.
- **`Seal` component** for on-chain status, consumed everywhere `contract.ts` awaits confirmation.
- **Mobile-first board pass** — board shrinks but action panels don't reflow; target 390px.

## Critical files

- `packages/web/src/app.css` — extend tokens (parchment vars, ink shadows, watercolor animations). Keep the existing palette (`:root` lines 12–69) and cell-highlight class names (`.your-column`, `.their-row`, `.scored`) — swap the visual treatment behind them.
- `packages/web/src/routes/+layout.svelte` — watercolor background layer, font loader.
- `packages/web/src/routes/+page.svelte` — lobby redesign with sigil-based game list.
- `packages/web/src/routes/game/[id]/+page.svelte` — refactor into phase components before adding assets.
- `packages/web/src/routes/onboarding/+page.svelte`, `routes/funding/+page.svelte` — theme unification.
- `packages/web/src/lib/components/` (new) — `Board`, `Number`, `Seal`, `PlayerSigil`, `Coin`, `WatercolorStroke`, `ResultCrest`, `JRPGWindow` (9-slice), `DamageNumber`, `Cursor`, `SpriteAnimation` (generic frame-stepper).
- `packages/web/static/art/` (new) — `backgrounds/`, `sprites/`, `numerals/`, `windows/`, `fx/`; plus `static/audio/`, `static/fonts/`.
- Global rule: `image-rendering: pixelated` on all sprite classes; `image-rendering: auto` on watercolor layers. Keep the two layers explicitly separate in CSS.
- Drive all visual state from the existing `GamePhase` enum in `packages/shared` — don't invent parallel UI state.

## Execution order

1. Art bible.
2. Refactor `game/[id]/+page.svelte` into components (no visual change).
3. Commission Tier 0 in parallel — numerals first (longest tail), then board + grid + strokes, then sigils + coins + cursor.
4. Integrate Tier 0 as one drop: backgrounds + sigils + numerals + 9-slice windows. This is the transformation moment.
5. Tier 1 moments, one beat per week.
6. Tier 2 chrome → Tier 3 atmosphere/audio → Tier 4 brand.
7. Polish: transition timing, sound mix, mobile sprite scaling.

## Verification

- **Visual regression:** before/after screenshots of all 10 game phases and 4 top-level pages, hosted on a `/design-review` route.
- **End-to-end play:** two browsers, real Base Sepolia USDC, one full 6-round match. Every transition has motion, every on-chain wait shows a seal, every round ends with a crest, the reveal feels distinct from ordinary moves.
- **Mobile:** 390px and 768px — panels reflow, board legible, tap targets ≥44px.
- **Accessibility:** numerals carry `aria-label` with the numeric value; color is never the sole signal (the original shipped a color-blind hue-shift toggle — strokes must also differ by shape/border).
- **Asset audit:** every asset listed with provenance (commissioned / licensed / original). No lifts from the original game's `reference/gameSource/graphics`.
