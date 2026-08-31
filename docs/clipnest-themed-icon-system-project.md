# ClipNest Themed Icon System

## Project status

**Project:** ClipNest Themed Icon System<br>
**Parent product:** ClipNest Chrome extension<br>
**Current extension version at project start:** 2.0.27<br>
**Theme system:** 8 themes<br>
**Default theme:** Night Shift<br>
**Scope decision:** Icon grouping / category taxonomy is explicitly out of scope.

---

# 1. Why this project exists

ClipNest now has a real theme system, but the icon treatment is still largely inherited from the original dark-theme implementation.

The current icon picker and preset cards use one shared icon set whose shapes work, but whose presentation is not yet intentionally designed for each theme. In some themes, especially Night Signal, the rest of the interface feels cohesive while the icon picker still looks like it belongs to the original purple/orange ClipNest.

The goal of this project is to make the icon system feel native to every theme without creating eight unrelated icon packs.

The result should feel like:

> Same ClipNest icon family. Eight intentionally art-directed presentations.

---

# 2. Primary goal

Redesign the **presentation** of existing preset icons so they adapt cleanly to each ClipNest theme.

The icon shapes should remain a shared system.

Themes may change:

- icon stroke / foreground color
- optional secondary accent color
- icon tile background
- icon tile border
- icon tile hover state
- selected icon state
- focus state
- disabled state
- icon picker container colors
- preset-row icon colors
- contrast tuning for light vs dark themes

The system must work consistently in both:

1. the **preset icon picker**
2. the **preset cards / preset chooser**

---

# 3. Explicitly out of scope

The following are **not part of this project**:

- icon grouping
- category taxonomy
- reorganizing icons into sections
- adding icon categories such as Reading, Work, Finance, etc.
- changing the number of available icons merely to fill categories
- changing preset behavior
- changing preset ordering
- changing drag-and-drop behavior
- changing preset menu behavior
- changing theme names or general theme palettes
- changing popup layout
- changing settings layout except where needed for icon-system support
- changing the ClipNest logo
- changing destination behavior
- replacing all icons with a completely new metaphor set
- animations
- animated icons
- per-theme icon shapes
- illustration-style icons
- emoji-based preset icons

---

# 4. Core design principle

## One icon family, multiple presentations

Do **not** create a different icon shape system for each theme.

The shared icon set should preserve:

- SVG path / icon glyph
- canvas size
- stroke weight
- line caps
- line joins
- optical padding
- icon proportions
- metaphor

Themes change only the surrounding visual treatment and color.

This keeps presets recognizable if the user changes themes.

A Books preset should still visually read as the same Books preset after moving from Rose Milk to Night Signal.

---

# 5. Existing ClipNest themes

The icon system must support all eight themes.

## Night Shift

Original ClipNest theme.

Intent:

- dark neutral base
- ClipNest purple primary
- ClipNest orange secondary
- unchanged visual baseline for existing users

The project must preserve the current Night Shift appearance unless a deliberate icon-specific refinement is approved.

---

## Rose Milk

Character:

- soft blush
- raspberry
- lilac
- warm dark text

Icon direction:

- raspberry / plum foreground
- pale blush icon tile
- lilac may be used as a restrained secondary accent
- avoid candy-like saturation
- avoid pink-on-pink contrast loss

---

## Cherry Cola

Character:

- burgundy-black
- hot pink
- coral

Icon direction:

- hot pink foreground
- dark wine tile
- coral only as secondary accent where useful
- no neon glow
- no gaming-style lighting

---

## Lavender Blush

Character:

- pale lavender
- violet
- rose

Icon direction:

- violet foreground
- pale lavender tile
- optional rose detail
- maintain stronger selected-state contrast than the light background might otherwise provide

---

## Strawberry Cream

Character:

- warm cream
- coral
- apricot

Current tuned palette direction:

- Background: `#FFF7F0`
- Surface: `#FFFCF9`
- Surface hover: `#FFF0E6`
- Border: `#EFD6C8`
- Text: `#352821`
- Muted: `#886F63`
- Primary: `#C94961`
- Primary hover: `#B83E55`
- Secondary: `#F2A65A`
- Secondary text/action: `#B85B16`
- Soft selected surface: `#FFE3D4`
- Focus: `#D85B6F`

Icon direction:

- coral foreground
- warm cream / peach tile
- apricot secondary accent
- clearly warmer than Rose Milk

---

## Berry Night

Character:

- plum-black
- magenta
- rose

Icon direction:

- magenta foreground
- deep plum tile
- restrained rose secondary accent
- flat, not glowing

---

## Mint Candy

Character:

- very pale mint
- pink
- mint

Icon direction:

- do not make every icon mint
- use pink as the stronger icon foreground in most active states
- mint can support tile/background/secondary states
- small mint text must use a darker accessible mint variant

---

## Night Signal

Character:

- deep navy
- electric blue
- signal yellow

Current palette direction:

- Background: `#071321`
- Surface: `#0D1B2D`
- Surface hover: `#132641`
- Border: `#294A73`
- Strong border: `#3B6090`
- Text: `#F4F7FF`
- Muted: `#90ACD5`
- Primary blue: `#1769FF`
- Primary hover: `#0B57E3`
- Secondary yellow: `#FFD21A`
- Secondary action: `#E8B900`
- Soft surface: `#10284A`
- Danger: `#FF6978`

Night Signal is the clearest example of why this icon project exists.

Desired treatment:

- selected destination / primary actions remain electric blue
- preset icons use signal yellow
- icon tiles use a dark navy surface with subtle yellow presence
- secondary actions can use yellow
- the icon picker should feel intentionally Night Signal, not like purple/orange ClipNest pasted onto navy

---

# 6. Icon-system architecture

The icon system should be expressed through a small number of semantic CSS tokens.

Recommended token layer:

```css
--cn-icon-fg
--cn-icon-fg-secondary
--cn-icon-tile-bg
--cn-icon-tile-border
--cn-icon-tile-hover-bg
--cn-icon-tile-hover-border
--cn-icon-selected-fg
--cn-icon-selected-bg
--cn-icon-selected-border
--cn-icon-focus
--cn-icon-muted
--cn-icon-disabled
```

If the existing UI needs fewer tokens, use fewer.

Do not create a token merely because it might be useful someday.

The goal is a compact semantic layer, not a design-system rewrite.

---

# 7. Required surfaces

## A. Preset icon picker

The screenshot that initiated this project shows the current icon picker.

The project must review and theme:

- picker container background
- picker border
- heading text
- "Keep Notion icon" treatment if it participates visually
- each icon button
- default icon foreground
- hover foreground
- hover background
- selected icon foreground
- selected icon tile background
- selected icon tile border
- keyboard focus
- disabled states, if any

The selected state must remain obvious without relying solely on a subtle color shift.

---

## B. Preset chooser cards

The same icon must be visually coherent when rendered in a preset card.

Review:

- icon foreground
- icon tile background
- icon tile border if present
- relationship to preset card surface
- hover state
- selected / active card state if applicable
- contrast against card background

The icon picker and preset card do not need identical tiles, but they must clearly belong to the same system.

---

# 8. Visual behavior rules

## Shape consistency

All themes use the same icon geometry.

No per-theme alternate books, folders, stars, rockets, etc.

---

## Color consistency inside one theme

An icon must not randomly change meaning between picker and preset row.

Example:

If Night Signal uses signal yellow as its preset-icon foreground, the same saved Books icon should remain yellow in:

- icon picker selected state
- preset card
- edit preset header icon

unless there is a deliberate hierarchy rule.

---

## No uncontrolled two-tone behavior

Some existing icons appear to contain multiple colors due to inherited CSS or SVG behavior.

Before implementing theme mapping, determine whether this is:

- intentional multi-path SVG styling
- inherited `currentColor`
- hard-coded SVG fill/stroke
- CSS affecting child paths
- browser rendering artifact

Two-tone icons may be used only if they are systematic.

Do not allow random purple + orange remnants inside new themes.

---

## Light-theme rule

On light themes:

- icon tile should be visible without heavy borders
- foreground contrast must remain strong
- selected tile cannot disappear into the page background
- pastel does not mean low contrast

---

## Dark-theme rule

On dark themes:

- avoid neon glow
- avoid large saturated halos
- keep icons crisp
- use color primarily in the glyph and selected tile
- let surfaces remain dark enough that text hierarchy still wins

---

# 9. Accessibility requirements

Icons are not always the only carrier of meaning, but visual state still needs adequate contrast.

Requirements:

- selected icon state should be visually distinct without requiring color-name recognition
- keyboard focus must be visible
- hover and selected states must not be identical
- disabled state must remain discernible
- icon glyphs should remain legible at actual popup scale
- avoid very pale accent foregrounds on white or near-white surfaces

Where an accent color is too light for small icon strokes, use a darker icon-specific variant rather than changing the entire theme palette.

---

# 10. Do not infer icon semantics from color

Color in this project is theme presentation, not category meaning.

For example:

- yellow does not mean finance
- pink does not mean personal
- blue does not mean work
- orange does not mean shopping

This is especially important because **icon grouping is out of scope**.

All preset icons should receive the same theme treatment rules unless the icon SVG itself requires an optical adjustment.

---

# 11. Technical constraints

This project must preserve the current ClipNest architecture and workflow.

## Do not:

- rewrite the preset system
- rewrite icon selection logic
- change stored preset schema unless proven necessary
- migrate icons to a new storage format unless proven necessary
- touch Notion startup routing
- touch Notion capture architecture
- touch Obsidian capture architecture
- touch selected-area architecture
- touch Quick Clip architecture
- broaden Chrome permissions
- add `<all_urls>`

## Prefer:

- CSS variables
- `currentColor`
- shared theme tokens
- narrow selectors
- existing icon IDs / values
- existing picker behavior

---

# 12. Versioning

Every code/test-build change increments the extension version.

At project start the current version is:

`2.0.27`

Therefore the first actual icon-system code change should use the next available version.

Do not assume a version number if repository state has changed. Inspect `manifest.json` first.

---

# 13. Workflow rules

For every implementation step:

1. Inspect exact current code.
2. Do not guess selectors or markup.
3. Make one narrow patch.
4. Back up before risky edits.
5. Validate immediately.
6. If validation passes, go directly to the specified browser check.
7. Ask for Terminal output only if validation fails or a read-only inspection is required.
8. Do not push, tag, package, publish, or release unless explicitly requested.
9. Do not advance past a failed visual regression.
10. Preserve Night Shift as the baseline.

---

# 14. Project phases

## Phase 1 - Exact implementation audit

Inspect:

- icon picker markup
- icon picker generation logic
- icon picker CSS
- preset icon rendering
- preset card icon CSS
- icon SVG / glyph source
- whether icons use `currentColor`
- hard-coded colors
- selected state logic
- hover state logic
- focus state logic
- any icon-specific inline styles
- any color embedded in SVG strings

Output:

- exact icon-rendering architecture
- list of selectors involved
- list of hard-coded icon colors
- recommended minimal token insertion points

No visual changes in this phase.

---

## Phase 2 - Tokenize icon presentation while preserving Night Shift

Introduce the semantic icon token layer.

Critical requirement:

**Night Shift must look exactly the same before and after this phase.**

This phase is architectural only.

Expected result:

- current icon rendering can be driven by variables
- no theme-specific redesign yet
- no behavior change

---

## Phase 3 - Night Signal pilot

Night Signal should be the first alternate theme fully redesigned because:

- its desired icon direction is already clear
- it is visually farthest from the original ClipNest palette
- it exposes purple/orange leakage immediately
- its success proves the token architecture

Night Signal target:

- yellow preset icon foreground
- dark navy icon tile
- subtle yellow-tinted selected tile
- blue remains the primary selected-control color outside the preset-icon system
- no purple remnants
- no orange remnants
- no neon glow

Test in:

- preset chooser
- Edit preset icon button
- icon picker
- selected picker icon
- hover state
- keyboard focus if available

---

## Phase 4 - Light-theme pair

Implement:

- Rose Milk
- Lavender Blush

Goal:

Prove that the icon token system works on very light backgrounds and that selected states maintain contrast.

---

## Phase 5 - Warm light themes

Implement:

- Strawberry Cream
- Mint Candy

Mint Candy needs special care because the green accent can become too pale for small icon strokes.

---

## Phase 6 - Dark expressive themes

Implement:

- Cherry Cola
- Berry Night

Goal:

Keep saturated accents crisp without introducing glow or visual noise.

---

## Phase 7 - Full visual consistency pass

Review all themes side by side at actual popup dimensions.

Check:

- same visual weight
- no icon looks thinner/heavier purely because of color
- selected state hierarchy
- picker/card consistency
- no legacy purple/orange leakage
- no light-theme washout
- no dark-theme neon effect
- no inconsistent tile radii or borders

---

# 15. Acceptance criteria

The project is complete when:

- all 8 themes intentionally style preset icons
- Night Shift preserves the original ClipNest icon appearance
- icon shapes remain identical between themes
- icon picker and preset rows feel like one system
- no theme contains accidental legacy accent colors
- selected icons are clearly selected
- hover states are visible
- focus states are visible
- light-theme icon contrast is adequate
- Night Signal matches the approved navy / electric-blue / signal-yellow direction
- icon grouping has not been introduced
- preset data model has not been changed without necessity
- no unrelated ClipNest behavior regresses

---

# 16. QA matrix

Use at least these visual checks for each theme:

| Surface | Check |
|---|---|
| Preset chooser | Saved preset icon readable |
| Preset chooser hover | Hover remains subtle and visible |
| Edit preset | Current preset icon looks correct |
| Icon picker | All icons readable |
| Icon picker selected | Selection unmistakable |
| Icon picker hover | Hover distinct from selected |
| Icon picker focus | Keyboard focus visible |
| Light themes | No low-contrast pastel icons |
| Dark themes | No unwanted glow |
| Theme switch | Same saved icon retains same shape |

---

# 17. Approved design direction

The approved design direction is:

> Shared glyphs, theme-native tiles and color treatment.

The project should avoid decorative excess.

Do not add:

- sparkles
- fruit symbols
- theme mascots
- theme-specific icon shapes
- gradients unless later explicitly approved
- glow unless later explicitly approved

The themed icon system should feel like part of ClipNest, not a skin pack.

---

# 18. First implementation task

Before any patch, inspect the exact current code that produces:

1. the icon picker shown in Edit preset
2. `.notion-preset-card-icon`
3. the saved icon value in each preset
4. selected icon picker state
5. hover/focus state
6. all hard-coded `#9027db`, `#db5b27`, `#c982ff`, SVG `stroke`, SVG `fill`, and `currentColor` references associated with these elements

Do not patch until those exact locations are known.

---

# 19. Suggested first read-only inspection

```bash
cd "/Users/alex/Documents/Vibe Coding/ClipNest/clipnest" || exit 1

echo "===== VERSION / STATUS ====="
grep -n '"version"' manifest.json
git status --short

echo
echo "===== ICON PICKER MARKUP / JS ====="
grep -RIn -B 20 -A 50 -E \
'Change preset icon|Keep Notion icon|preset.*icon|icon.*picker|iconPicker|presetIcon' \
popup.html popup.js |
head -900

echo
echo "===== ICON PICKER CSS ====="
grep -n -B 25 -A 60 -E \
'icon-picker|icon.*option|preset.*icon|notion-preset-card-icon' \
popup.css themes.css |
head -1200

echo
echo "===== ICON COLOR REFERENCES ====="
grep -RIn -E \
'#9027db|#db5b27|#c982ff|currentColor|stroke=|fill=' \
popup.js popup.css themes.css |
grep -Ei \
'icon|preset|picker' |
head -900

echo
echo "===== PRESET ICON STORAGE ====="
grep -RIn -B 20 -A 45 -E \
'icon:|\.icon|presetIcon|iconValue' \
popup.js notion-store.js |
head -900
```

The output of this inspection should determine the first patch.

---

# 20. Final scope statement

This is an **icon presentation redesign**, not an icon-information architecture project.

Icon grouping remains explicitly out of scope.
