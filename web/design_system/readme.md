# Wander — Structured Fluidity Design System

A design system for **Wander**, a pedestrian navigation app that personalizes
each walk to the *kind* of outing you're on — alone, as a couple, or with
friends. The system's design philosophy is **"Structured Fluidity"**: soft,
glowing, ambient data representation (radar mist, glowing routes) wrapped around
crisp, pill-shaped geometric controls.

> **Sources.** This system was authored from a written brief — no codebase or
> Figma file was attached. All tokens, components, and the UI kit are original
> implementations of the brief's specification. If/when a production codebase or
> Figma library exists, reconcile this system against it.

---

## What's in here

| Area | Location |
|---|---|
| Global CSS entry (link this) | `styles.css` |
| Tokens | `tokens/` — `colors.css`, `typography.css`, `spacing.css`, `effects.css`, `fonts.css` |
| Foundation specimen cards | `guidelines/*.html` |
| Components (React) | `components/forms/`, `components/map/`, `components/surfaces/` |
| UI kit | `ui_kits/wander-navigator/` |
| This guide | `readme.md` |
| Agent Skill manifest | `SKILL.md` |

### Components
- **forms/** — `Button`, `Input`, `OutingToggle`
- **map/** — `RadarMist`, `MapRoute`, `POIChip`
- **surfaces/** — `Card`, `Badge`

Consume via the generated bundle: `const { Button } = window.WanderStructuredFluidityDS_140bd8`.

### UI kit
- **wander-navigator/** — the full pedestrian-nav flow: *Plan → compare routes →
  navigate*, with the outing personality re-theming the experience.

---

## CONTENT FUNDAMENTALS

**Voice — a calm, knowledgeable walking companion.** Wander speaks the way a
thoughtful friend who knows the city would: warm, low-pressure, quietly
confident. It never barks commands or gamifies the walk.

- **Person.** Address the user as **you**; the product refers to itself as
  **we** only when describing what it does on their behalf ("We weight quiet
  streets and good light"). First person singular is never used.
- **Tone.** Reassuring and unhurried. We *suggest* and *offer*, we don't
  *optimize* or *maximize*. "A calm route through Riverside" — not "Fastest
  route, 12% shorter."
- **Casing.** Sentence case for all UI prose, headings, and buttons
  ("Find routes", "Start navigation"). The **only** uppercase is the monospace
  data layer — POI names, distances, route tags, and labels
  ("MAPLE CAFÉ", "320 M · LEFT", "QUIET ROUTE"). That contrast *is* the brand.
- **Numbers & data.** Always concrete and human-scaled: minutes and metres,
  never percentages or scores. "16 min · 1.1 km". Distances to a turn in metres
  ("120 m"), trip lengths in km.
- **Length.** Short. One idea per line. Route descriptions are a single clause:
  "Quiet streets, good light." Avoid stacked qualifiers.
- **Emoji.** None. The expressive layer is colour and glow, not emoji.
- **Examples.**
  - Greeting: "Good evening, Mara" → "Plan your wander"
  - Route card: "Calm & green · 16 min" with tags "QUIET ROUTE", "PREFERENCE MATCH"
  - Turn prompt: "Turn left onto **Linden Walk**" with "120 m" as the hero number
  - Alert POI: "Late Pharmacy" (Orchid) — stated plainly, never alarmist.

---

## VISUAL FOUNDATIONS

**The big idea.** Two visual registers held in tension:
1. **Fluid / ambient** — the *data* about the world. Soft radial mist fields,
   glowing pill-shaped routes, frosted glass overlays. Everything here is
   blurred, breathing, semi-transparent, colour-coded by preference.
2. **Structured / crisp** — the *controls*. Absolute pills, 2px outlines,
   uppercase monospace, hard geometry. Everything here is sharp and decisive.

### Colour
- **Canvas is soft teal `#C1EBE9`** — a cool aqua that ties into the Mint/Seaweed
  family (the original brief specified Ivory `#FEFFE3`; retuned at review). All
  surfaces are tints of this canvas; "white" cards are `#FFFFFF` at ~93% over it.
  Note: the Mint safe-path sits close to the canvas in hue, so it leans on its
  glow + the bolder stroke weight to stay legible.
- **Cobalt `#4456FF`** is the single primary accent — controls, focus rings,
  current location, links. Used sparingly and decisively.
- **Map semantics are fixed:** Mint `#A6FFE8` = main safe path, Lime `#C9FF46` =
  preference match, Liliac `#9FA3FF` = alternate path (thin, semi-transparent),
  Orchid `#D238EB` = specialized/alert POI.
- **Seaweed `#255A4B`** is the text/structure colour — a deep desaturated green,
  never black. Three ramp steps for strong / body / muted text.
- **Outing personalities** are three slightly-shifted accents along a blue→mauve
  arc: Solo Cobalt `#4456FF`, Couple Iris `#8A5BFF`, Friends Mauve `#B84BFF`.
  The active outing tints its radar mist and the OutingToggle fill.
- **Vibe of imagery.** There is no photography in the core experience — the
  "imagery" is generated: warm ivory base, cool glowing data on top. If photos
  are ever introduced, treat them warm and slightly desaturated to sit on ivory.

### Type
- **Space Grotesk** for everything spoken in sentence case — display numerals
  (44px arrival times), titles, headings, body, buttons. Geometric, friendly,
  slightly quirky.
- **Space Mono** for the uppercase data layer — POI names, distances, badges,
  labels. Always uppercase, always tracked (`0.12em`–`0.18em`).
- Display weights are bold (700) with tight tracking (`-0.02em`); body is
  regular (400) at 1.45 line-height.

### Spacing, radii, geometry
- 4px spacing base. Generous gutters (20px) on mobile sheets.
- **Pill is the default control shape** (`border-radius: 999px`) — buttons,
  inputs, chips, toggles, badges. Surfaces use soft radii (28/18/12px).
- Controls are **56px** standard height (44px compact / min touch target).
- Outlines are **2px**; hairlines are 1px at ~16% Seaweed.

### Backgrounds & texture
- The map is a faint **Seaweed grid** (34px) on ivory, with translucent
  rounded "blocks" for city texture — never a photoreal map.
- **Radar mist**: large radial-gradient blurs (`blur 48–80px`) sitting behind
  the grid as areas of interest, colour-coded by preference weight. They
  *breathe* (slow 2.4s opacity/scale pulse).
- No hard gradients in UI chrome; the only gradients are the soft radial mists.

### Elevation, blur & transparency
- **Glass** overlays (route summary, turn prompt) use `backdrop-filter: blur(18px)`
  over a 72%-ivory wash with a faint white top border — they float over the live map.
- **Shadows** are soft, low-contrast, tinted with Seaweed (never neutral grey):
  `0 4px 20px rgba(37,90,75,0.10)` for cards, larger for raised/sheet.
- **Glow** is the emphasis tool, not shadow: Mint/Lime path glows, Cobalt focus
  glow, Orchid alert glow. A recommended path **intensifies its glow** (pulse)
  when crossing an active radar-mist zone.

### Motion
- Two easings: **fluid** `cubic-bezier(0.22,1,0.36,1)` for ambient/settle
  transitions, and **crisp** `cubic-bezier(0.65,0,0.35,1)` for control snaps.
- Durations: 140 / 240 / 420ms; ambient pulses run 2.4s.
- **Hover:** outline controls fill with solid Cobalt; ghost controls take a soft
  Cobalt tint; primary darkens to `--accent-hover`.
- **Press:** controls scale to `0.97` (crisp). No bounces.
- **Focus:** inputs animate from a hairline to a solid 2px Cobalt ring + glow.
- Respect `prefers-reduced-motion` — disable mist breathing and path pulses.

### Cards
- Soft ivory surfaces, 18px radius, hairline border, low Seaweed-tinted shadow.
- `glass` floats frosted over the map; `sheet` is the bottom drawer (large top
  radius only, top shadow). No heavy borders, no left-accent-border pattern.

---

## ICONOGRAPHY

- **System.** Wander uses a **thin-stroke line icon set** — 1.75px stroke,
  round caps and joins, 24px grid, `currentColor`. This matches the geometric,
  friendly tone of Space Grotesk.
- **Substitution flag.** No production icon set was provided, so the kit ships a
  small **custom inline-SVG set** (`ui_kits/wander-navigator/Icons.jsx`:
  search, nav, walk, heart, user, users, pin, clock, chevron, close, layers,
  sun, leaf, bolt, bookmark, plus, coffee). It is intentionally **Lucide-
  compatible** in weight and style — for production, swapping in
  [Lucide](https://lucide.dev) is the recommended path and will look consistent.
  A specimen sits in `guidelines/brand-iconography.html`.
- **Emoji / unicode.** Not used as iconography anywhere.
- **POI markers** are typographic, not iconographic — uppercase mono labels in
  capsules (see `POIChip`). Icons are reserved for controls and list affordances.

---

## Known substitutions / caveats
- **Fonts** are loaded from the Google Fonts CDN (`tokens/fonts.css`), not
  self-hosted. For an offline-safe system, host `Space Grotesk` + `Space Mono`
  `.woff2` files locally and replace the `@import` with `@font-face` rules.
- **Icons** are a custom Lucide-compatible set (see above), not extracted brand assets.
- No real product source (codebase/Figma) was available; reconcile when one exists.
