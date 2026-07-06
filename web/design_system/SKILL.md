---
name: wander-design
description: Use this skill to generate well-branded interfaces and assets for Wander, the pedestrian navigation app, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping. Wander's philosophy is "Structured Fluidity" — soft glowing ambient map data wrapped around crisp pill-shaped controls.
user-invocable: true
---

Read the `readme.md` file within this skill, and explore the other available files.

Key files:
- `readme.md` — full design guide: content fundamentals, visual foundations, iconography, manifest.
- `styles.css` — the global CSS entry point; link this to inherit all tokens. It `@import`s everything in `tokens/`.
- `tokens/` — colors, typography, spacing, effects, fonts (CSS custom properties).
- `components/` — React primitives (`forms/`, `map/`, `surfaces/`) with `.d.ts` + `.prompt.md`.
- `ui_kits/wander-navigator/` — full app flow recreation (Plan → Routes → Navigate).
- `guidelines/*.html` — foundation specimen cards.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view, linking `styles.css` for tokens. If working on production code, copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

Quick brand reminders:
- Canvas is Ivory `#FEFFE3`, never white. Text is Seaweed `#255A4B`, never black.
- Cobalt `#4456FF` is the only primary accent. Controls are 56px pills with 2px outlines.
- Map semantics are fixed: Mint = safe path, Lime = preference match, Liliac = alternate, Orchid = alert POI.
- Sentence case everywhere EXCEPT the uppercase tracked monospace data layer (POIs, distances, tags).
- No emoji. Emphasis comes from glow, not shadow. Radar mist = soft radial blurs behind the map.
