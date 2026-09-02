# Civil Sarabande — Art Bible

This is the reference every asset is checked against before it ships. It pairs with the live specimen page at `/design` in the web app, which renders the palette from the real CSS tokens and shows a procedural stand-in for each asset class at the correct scale. When this document and the page disagree, fix the page, then this document.

Direction recap: **watercolor + 16/32-bit JRPG sprite.** Soft painted backgrounds underneath; crisp, pixel-snapped sprites and framed windows on top. The tension between the two layers is the look. See `ui-art-direction.md` for the reasoning and the asset brief.

---

## 1. Scale and grid

**Base unit: 1 sprite pixel = 2 CSS pixels (2×).** Every sprite is authored at 1× and displayed at exactly 2× with `image-rendering: pixelated`. Nothing is ever scaled by a non-integer factor. If a sprite must be larger, author it larger; do not scale.

| Asset class | Authored size (1×) | Displayed size | Notes |
|---|---|---|---|
| Suited numerals 1–36 | 24 × 24 | 48 × 48 | Sits centered in a 48px mobile cell or 60px desktop cell |
| Player sigils | 32 × 32 | 64 × 64 | Portrait plus 1px sprite border inside the canvas |
| Coins and chips | 12 × 12 | 24 × 24 | Single, stack of 10, stack of 100 |
| Cursor | 12 × 12 | 24 × 24 | Hot-spot at top-left |
| UI icons | 16 × 16 | 32 × 32 | Wallet, coin, timer, history, fold, check, call, raise, leave |
| Damage-number digits | 8 × 12 per digit | 16 × 24 | Two palettes (you / them) plus outline |
| Pixel UI font | 8 × 8 cell | 16 × 16 | Caps, digits, punctuation; 16px line height at 2× |
| Window 9-slice | 8px corners, 4px edges | 16px / 8px | Three variants: parchment, ink-blue, blood |
| Sprite FX frames | 32 × 32 or 48 × 48 | 64 / 96 | Reveal cast, seal stamp, coin plink |

**Watercolor layer is the exception.** Backgrounds and washes are painted, not pixel art. Author at 2048 × 1536 (4:3) minimum, export as WebP or PNG, display with `image-rendering: auto`. They may be scaled freely.

**Alignment.** All sprites snap to the 2px grid. A sprite's CSS position must be an even number of pixels; the board cell size is chosen so numerals land on the grid.

---

## 2. Palette

The app's CSS tokens are the source of truth for UI chrome (`packages/web/src/app.css`). Sprites use the fixed 16-color palette below, drawn from those tokens. No other colors in pixel art. Anti-aliasing is not permitted on sprites; edges are hard.

### Sprite palette (16)

| Name | Hex | Role |
|---|---|---|
| Ink 1 | `#0d0a0e` | Outlines, deepest shadow, board lines |
| Ink 2 | `#2a2230` | Interior shadow, window inner edge |
| Ink 3 | `#4a3f52` | Mid shadow, disabled |
| Parchment 1 | `#f1e6cf` | Brightest highlight, paper |
| Parchment 2 | `#d9c8a5` | Paper mid-tone |
| Parchment 3 | `#b8a27c` | Paper shadow, aged edge |
| Burgundy 1 | `#6d2f38` | **You**, dark |
| Burgundy 2 | `#8b4049` | **You**, base |
| Burgundy 3 | `#a85560` | **You**, light |
| Burgundy 4 | `#d08090` | **You**, highlight |
| Gold 1 | `#9a7d1c` | **Opponent** and pot, dark |
| Gold 2 | `#c9a227` | **Opponent** and pot, base |
| Gold 3 | `#e6bb3a` | **Opponent** and pot, light |
| Gold 4 | `#f5dc7a` | **Opponent** and pot, highlight |
| Verdant | `#4a8b5c` | Success, win |
| Blood | `#a84545` | Danger, loss, fold |

Shading uses at most four steps of one hue plus Ink 1 for the outline. Highlights come from the hue's step 4 or Parchment 1, never pure white.

### Player color rule

**You are burgundy. The opponent is gold.** This matches the existing board highlighting (`your-column` burgundy, `their-row` gold, scored intersection burgundy with gold text). Color is never the only signal: burgundy elements also carry a vertical stroke or column motif, gold elements a horizontal stroke or row motif, so the color-blind toggle from the original game has a shape to fall back on.

### Watercolor palette

Washes use the same hues at 20 to 40 percent opacity over parchment, wet-edged. Ink lines are Ink 1 at roughly 80 percent with visible hand tremor. Backgrounds lean cool (Ink 2 into Burgundy 1) at the edges and warm (Parchment 2) at the center so sprites read against them.

---

## 3. Typography

| Role | Face | Status |
|---|---|---|
| Display headings | Cinzel (fallback Palatino) | Placeholder; a more distinctive painted display face may replace it |
| Body | Crimson Text (fallback Georgia) | Keep |
| Mono (addresses, ids) | JetBrains Mono | Keep |
| Pixel UI font | To commission or license | 8 × 8 cell, caps plus digits, used for timers, coin counts, bet amounts |
| Board numerals | Suited glyph sprites | Not a font; each of 1–36 is a unique character. Every numeral carries `aria-label` with its numeric value |

---

## 4. Layering

Every screen is composed in four layers, back to front. Assets are built for exactly one layer and never mix rendering modes.

1. **Wash** — painted watercolor background. `image-rendering: auto`. May animate slowly (breathing loop).
2. **Ink** — board grid overlay, window 9-slices, ornaments. Pixel-snapped.
3. **Sprite** — numerals, sigils, coins, cursor, icons. Pixel-snapped, 2×.
4. **FX** — damage numbers, reveal cast, seal stamps, particles. Pixel-snapped sprite frames, optionally over a watercolor particle overlay.

---

## 5. Motion vocabulary

Timing comes from `packages/web/src/lib/motion.ts` and must not be re-invented per asset.

| Preset | Use | Timing |
|---|---|---|
| `quickFade` | Content swapping in place (phase name, coin counts) | 150ms |
| `panelIn` | A panel or section arriving | 220ms rise of 12px, ease-out |
| `popIn` | A value or verdict landing | 260ms scale from 0.85 with overshoot |
| Staged reveal | Round end, game over | Elements land 100 to 300ms apart, verdict last |

**Sprite animation** runs at 8 to 12 frames per second (83 to 125ms per frame). Idle loops are 4 to 6 frames. One-shot FX are 12 to 20 frames. Frames are delivered as a horizontal strip with a JSON manifest (`frames`, `fps`, `loop`).

All motion collapses to zero under `prefers-reduced-motion`. A sprite animation must still convey its meaning on its final frame alone.

---

## 6. Delivery specs

**Location.** `packages/web/static/art/<category>/`, with categories `backgrounds`, `sprites`, `numerals`, `windows`, `fx`. Audio in `static/audio/`, fonts in `static/fonts/`.

**Naming.** Lower-kebab-case, scale suffix on raster sprites: `numeral-17@1x.png`, `numeral-17@2x.png`. Sheets: `numerals@2x.png` plus `numerals.json`. Watercolor: `bg-duel-chamber.webp`. FX strips: `fx-reveal-cast@2x.png` plus `fx-reveal-cast.json`.

**Formats.**
- Sprites: PNG, indexed color from the 16-color palette, transparent background, delivered at both 1× and 2×.
- Sprite sheets: one PNG per class plus a JSON manifest mapping name to `{x, y, w, h}` at 1×.
- Windows: PNG 9-slice at 1× and 2× with the slice insets in a sidecar JSON.
- Watercolor: WebP (lossy, quality 85) with a PNG master kept out of the repo.
- Sigils: PNG sprite at 32 × 32 plus an SVG source if drawn vector-first.
- Audio: OGG plus M4A, mono, 44.1kHz, peak at -3dBFS, under 200KB per cue.

**Provenance.** Every file gets a row in `docs/asset-ledger.md` (to be created with the first delivered asset): file, author, license, source, and date. Nothing derived from `reference/gameSource/graphics` may be committed.

---

## 7. QA checklist

An asset is accepted only when every line is true.

- Colors are only from the sprite palette; no anti-aliased edge pixels.
- Authored at the size in the scale table; displays at exactly 2×.
- Reads clearly at 1× on a dark surface and on parchment.
- Player-owned elements use the right hue (you burgundy, opponent gold) and carry the matching shape motif.
- Text or numerals on any window pass 4.5:1 contrast against the window interior.
- A sprite animation makes sense on its final frame alone.
- Motion uses a preset from `motion.ts` or the sprite fps range; nothing custom.
- Delivered at the right path and name, with manifest or sidecar where required.
- Provenance recorded.

---

## 8. Specimen page

`/design` in the web app is the living version of this bible. It shows:

- The full CSS token palette and the 16-color sprite palette, read live from the stylesheet.
- A scale ladder proving the 2× rule.
- Procedural stand-ins for a suited numeral, cursor, coin, sigil, JRPG window, and watercolor wash, each at spec size. These are placeholders to build against, not final art; each is labeled as such.
- The motion presets with a replay control.
- The layering model.

When real assets land, they replace the stand-ins on that page first, so the page is always the current truth.
