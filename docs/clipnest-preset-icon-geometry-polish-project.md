# ClipNest Preset Icon Geometry Polish Project

## Project status

**Project:** ClipNest Preset Icon Geometry Polish<br>
**Parent product:** ClipNest Chrome extension<br>
**Current extension version at project start:** 2.0.31<br>
**Canonical icon system:** Monochrome themed glyphs + theme-native interaction states<br>
**Icon count:** 28<br>
**Scope decision:** Polish every existing icon. No icon grouping or category taxonomy.

---

# 1. Why this project exists

ClipNest now has a coherent themed icon system. The remaining inconsistency is in the geometry of the individual preset icons.

The current icon family already has a good shared foundation:

- 24×24 SVG viewBox
- outline-only construction
- stroke width 1.9
- rounded line caps
- rounded line joins
- no fills
- shared rendering path
- identical geometry across themes
- theme color handled separately from icon geometry

The project must preserve that foundation.

The purpose of this project is to make **all 28 icons feel intentionally drawn as one family**.

The work is not a new icon pack. It is a geometry and optical-balance polish pass.

---

# 2. Primary goal

Polish every preset icon so the full set is:

- clean
- recognizable at 21–23 px
- optically balanced
- internally consistent
- simple enough for a popup UI
- aesthetically coherent
- visually stable across all ClipNest themes

Every icon should feel like it was drawn by the same person for the same product.

---

# 3. Explicitly out of scope

Do not introduce:

- icon grouping
- category taxonomy
- icon sections
- labels inside the picker
- new icon categories
- per-theme icon geometry
- theme-specific alternate glyphs
- filled icon variants
- emoji replacements
- gradients
- shadows inside SVG glyphs
- animation
- decorative flourishes
- icon reordering unless explicitly requested later
- changes to preset storage format
- changes to preset behavior
- changes to theme architecture
- changes to popup layout
- changes to Notion routing/capture logic
- changes to Quick Clip
- changes to Obsidian capture
- changes to permissions

This is strictly an **icon geometry polish project**.

---

# 4. Non-negotiable icon-family rules

All 28 icons must use the same base language.

## Canvas

- `viewBox="0 0 24 24"`
- artwork should remain optically centered
- target optical footprint: approximately 18×18 within the 24×24 canvas
- exceptions are allowed only when the metaphor genuinely needs extra width/height

## Stroke

- keep shared stroke width at `1.9`
- do not introduce per-icon stroke widths unless a proven rendering problem requires it
- round line caps
- round line joins
- no fill

## Complexity

At popup size, recognition beats detail.

Prefer:

- one strong silhouette/metaphor
- 1–3 internal details
- fewer intersections
- fewer tiny line fragments
- fewer micro-elements

Avoid:

- unnecessary internal lines
- tiny decorative pieces
- visual noise
- details visible only at large zoom
- dense intersections that become blobs

## Optical balance

Icons should have similar perceived weight, not merely similar mathematical dimensions.

Review:

- width
- height
- empty space
- center of gravity
- visual density
- baseline
- circular vs rectangular weight
- tiny detached elements

## Theme behavior

Icon geometry must remain identical in every theme.

Theme code controls color only.

---

# 5. Approved visual direction

The approved icon treatment is:

> **Monochrome themed glyphs. Theme-native interaction states. Shared geometry across every theme.**

The SVG data may keep `primary` and `accent` path arrays internally, but geometry polish must not rely on two-tone color to make an icon understandable.

Each icon must still read correctly when every path is the same color.

---

# 6. Current icon inventory and polish brief

The current order must be preserved unless explicitly approved otherwise.

## 1. Inbox

Current concept:
- tray
- downward arrow

Polish target:
- preserve instant recognition
- simplify the tray if needed
- ensure the arrow does not visually collide with the tray
- keep the icon from feeling top-heavy
- make arrowhead proportions consistent with other directional icons

Acceptance:
- reads as Inbox/Download immediately
- no cramped center
- comparable weight to Article and Folder

---

## 2. Reading

Current concept:
- open book

Polish target:
- preserve existing metaphor
- refine symmetry between left/right pages
- make center seam clean
- keep page curves subtle
- avoid overly organic curvature

Acceptance:
- one of the visual reference icons for the family
- balanced at 21 px
- centered without appearing too wide

---

## 3. Article

Current concept:
- document with folded corner and lines

Polish target:
- refine folded-corner geometry
- simplify interior text lines if needed
- make line lengths intentional
- avoid crowding around fold

Acceptance:
- document reads clearly
- fold remains legible
- internal details do not dominate

---

## 4. Notes

Current concept:
- pencil

Polish target:
- increase optical presence
- refine body angle
- simplify tip/eraser construction
- avoid appearing smaller than neighboring glyphs

Acceptance:
- pencil fills comparable visual area to Article and Ideas
- crisp diagonal
- immediately readable at 21 px

---

## 5. Ideas

Current concept:
- lightbulb

Polish target:
- simplify bulb contour
- ensure rays are evenly spaced
- reduce unnecessary micro-details
- refine base lines

Acceptance:
- bulb remains friendly and clear
- rays do not look spiky
- visual weight matches Tasks

---

## 6. Tasks

Current concept:
- circle with check

Polish target:
- preserve simplicity
- refine check proportions
- ensure check does not touch circle
- optical centering

Acceptance:
- should remain one of the cleanest icons in the set

---

## 7. Pin

Current concept:
- push pin

Polish target:
- reduce tall/skinny appearance
- enlarge pin head slightly
- shorten or rebalance stem
- keep silhouette stable

Acceptance:
- recognizable without depending on context
- visually comparable to Calendar in height
- not fragile-looking

---

## 8. Projects

Current concept:
- folder

Polish target:
- slightly improve vertical presence
- clean folder tab
- ensure body is not too flat
- maintain strong simple silhouette

Acceptance:
- clear folder
- no unnecessary internal line
- optical weight close to Work

---

## 9. Knowledge

Current concept:
- brain

Polish target:
- substantial redraw allowed
- current mirrored structure is too abstract
- create a simple brain silhouette using a few rounded lobes
- preserve outline-only style
- avoid excessive squiggles

Acceptance:
- reads as a brain at 21 px
- no resemblance to brackets/kidneys
- no more detail than necessary

---

## 10. Bookmark

Current concept:
- bookmark ribbon

Polish target:
- preserve
- refine lower notch if needed
- verify width/height balance

Acceptance:
- simple reference-quality icon

---

## 11. Favorites

Current concept:
- star

Polish target:
- simplify
- remove unnecessary internal structure
- use a clean five-point outline
- refine point lengths and inner angles

Acceptance:
- star silhouette reads instantly
- no visual clutter
- matches outline weight of Heart

---

## 12. Launch

Current concept:
- rocket

Polish target:
- simplify rocket body
- reduce line intersections around fins/flame
- improve silhouette
- keep dynamic angle

Acceptance:
- immediately reads as rocket
- not denser than Media
- clear at 21 px

---

## 13. Goals

Current concept:
- target with arrow

Polish target:
- simplify target rings
- simplify arrow construction
- reduce intersections
- ensure target remains recognizable before arrow detail

Acceptance:
- reads as target/goal instantly
- less busy than current version
- no tangled center

---

## 14. Calendar

Current concept:
- calendar

Polish target:
- preserve strong silhouette
- refine binding tabs and interior marks
- ensure interior marks are not too tiny

Acceptance:
- reference-quality icon
- strong rectangle without feeling heavy

---

## 15. People

Current concept:
- two people

Polish target:
- redraw for better symmetry
- avoid second person looking attached to first
- establish clear foreground/background relationship
- simplify shoulders

Acceptance:
- clearly two people
- balanced horizontal footprint
- no awkward detached fragments

---

## 16. Discussions

Current concept:
- speech bubbles

Polish target:
- simplify bubble arrangement
- reduce tiny secondary lines
- preserve sense of conversation
- avoid looking like a document

Acceptance:
- reads as discussion/chat
- cleaner than current
- similar complexity to Links

---

## 17. Code

Current concept:
- code brackets/slash

Polish target:
- preserve
- refine spacing between left bracket, slash and right bracket
- ensure slash angle and length feel intentional

Acceptance:
- reference-quality icon
- simple and centered

---

## 18. Research

Current concept:
- laboratory flask

Polish target:
- preserve
- simplify liquid/details if needed
- refine neck/body proportions
- ensure base does not feel too heavy

Acceptance:
- immediate flask recognition
- centered
- crisp at small size

---

## 19. Links

Current concept:
- chain links

Polish target:
- reduce intersection density
- refine link proportions
- increase negative space where links overlap
- preserve diagonal flow

Acceptance:
- clearly chain links
- center does not blob at 21 px
- matches Code in perceived weight

---

## 20. Work

Current concept:
- briefcase

Polish target:
- preserve
- refine handle
- simplify internal clasp/detail
- make outer rectangle slightly softer if needed

Acceptance:
- reference-quality icon
- immediate briefcase recognition

---

## 21. Finance

Current concept:
- dollar sign in circle

Polish target:
- preserve
- refine dollar sign centering and vertical alignment
- verify circle size against Tasks

Acceptance:
- clear and balanced
- no cramped currency glyph

---

## 22. Shopping

Current concept:
- cart

Polish target:
- substantial cleanup
- increase optical size
- simplify basket
- simplify wheels
- eliminate tiny detached micro-details
- make silhouette stronger

Acceptance:
- immediately reads as cart
- visually comparable in size to Heart and Media
- wheels remain visible without becoming dots of noise

---

## 23. Personal

Current concept:
- heart

Polish target:
- smooth curves
- make shape more geometric and intentional
- maintain warmth without hand-drawn wobble
- refine lower point

Acceptance:
- clean heart outline
- balanced and symmetric enough for UI use
- similar visual weight to Star

---

## 24. Media

Current concept:
- clapper/video

Polish target:
- simplify aggressively
- reduce structural lines
- preserve media/video meaning
- consider a clean video-frame + play symbol if that is more legible than the current clapper construction

Acceptance:
- recognizable at 21 px
- no tiny roof/clapper clutter
- not denser than Calendar

---

## 25. Learning

Current concept:
- graduation cap

Polish target:
- preserve
- simplify tassel
- refine cap perspective
- improve balance between cap and tassel

Acceptance:
- clear graduation cap
- tassel does not dominate
- stable silhouette

---

## 26. Web

Current concept:
- globe

Polish target:
- reduce line density
- preserve outer circle
- simplify latitude/longitude geometry
- maintain globe recognition with fewer intersections

Acceptance:
- clearly a globe
- center remains open enough at 21 px
- not visually heavier than Finance

---

## 27. Explore

Current concept:
- compass

Polish target:
- substantial redraw
- create an unmistakable compass needle
- simplify outer circle
- remove ambiguous `i`/slash appearance
- strong directional center

Acceptance:
- reads as compass/explore without label
- clean center
- no ambiguous glyph

---

## 28. Trending

Current concept:
- flame

Polish target:
- simplify outer flame contour
- simplify inner flame to one clear curve
- reduce nested complexity
- improve symmetry/flow

Acceptance:
- immediate flame recognition
- no tangled center
- visual weight similar to Ideas

---

# 7. Quality tiers

Every icon must finish at one of these levels:

## Tier A - Reference quality

The icon is clean enough to use as a family reference.

Target icons after polish:
- Reading
- Tasks
- Bookmark
- Calendar
- Code
- Research
- Work
- Finance

## Tier B - Production quality

The icon is aesthetically clean, recognizable and consistent, even if its metaphor requires slightly more complexity.

All other icons must reach at least this level.

No icon may remain at a “good enough because it is recognizable” level.

---

# 8. Implementation strategy

Do not rewrite the entire icon array in one blind patch.

The work must proceed in controlled batches.

## Batch 1 - Structural problem icons

Polish first:

1. Knowledge
2. Goals
3. Shopping
4. Media
5. Explore

Reason:
These have the largest geometry problems and will establish the new quality bar.

## Batch 2 - Optical balance icons

Polish:

6. Inbox
7. Notes
8. Pin
9. Projects
10. People
11. Discussions
12. Links
13. Web
14. Trending

## Batch 3 - Already-strong icons

Polish lightly:

15. Reading
16. Article
17. Ideas
18. Tasks
19. Bookmark
20. Favorites
21. Launch
22. Calendar
23. Code
24. Research
25. Work
26. Finance
27. Personal
28. Learning

Even strong icons must be inspected and deliberately approved.

---

# 9. Strict workflow

This project must be followed exactly.

For every batch:

1. Inspect exact current icon path data.
2. Do not guess or patch from memory.
3. Create a backup.
4. Change only the icon path data needed for that batch.
5. Do not change storage IDs.
6. Do not change legacy emoji mappings.
7. Do not change icon order.
8. Do not change labels.
9. Do not change theme CSS unless a geometry-specific rendering issue proves it necessary.
10. Increment extension version for every code/test build.
11. Run JS syntax validation.
12. Run `git diff --check`.
13. Verify only intended path blocks changed.
14. Reload extension.
15. Visually inspect the edited icons at actual popup size.
16. Do not advance if any edited icon looks worse or ambiguous.
17. Do not perform broad regression testing unless explicitly requested.
18. Do not push, tag, package, publish or release unless explicitly requested.

---

# 10. Comparison discipline

Every geometry patch must be judged against:

- the previous version
- neighboring icons in the picker
- actual 21 px picker rendering
- actual 22 px preset-card rendering
- at least one light theme
- at least one dark theme

Color is not a geometry fix.

If an icon looks bad in monochrome, fix the path geometry.

---

# 11. What must never change accidentally

The following identifiers are part of existing preset compatibility and must remain stable:

- `clipnest:inbox`
- `clipnest:reading`
- `clipnest:article`
- `clipnest:notes`
- `clipnest:idea`
- `clipnest:tasks`
- `clipnest:pin`
- `clipnest:projects`
- `clipnest:knowledge`
- `clipnest:bookmark`
- `clipnest:favorites`
- `clipnest:launch`
- `clipnest:goals`
- `clipnest:calendar`
- `clipnest:people`
- `clipnest:discussions`
- `clipnest:code`
- `clipnest:research`
- `clipnest:links`
- `clipnest:work`
- `clipnest:finance`
- `clipnest:shopping`
- `clipnest:personal`
- `clipnest:media`
- `clipnest:learning`
- `clipnest:web`
- `clipnest:explore`
- `clipnest:trending`

Legacy emoji resolution must also remain intact.

Only path geometry should change unless a separate approved requirement appears.

---

# 12. Acceptance criteria for the full project

The project is complete only when:

- all 28 icons have been deliberately reviewed
- all 28 icons have been either polished or explicitly confirmed unchanged
- all icons read clearly at popup size
- no icon depends on two-tone coloring for recognition
- no icon contains unnecessary micro-detail
- no icon looks noticeably smaller or heavier than its neighbors without good reason
- circular icons have comparable perceived weight
- rectangular icons have comparable perceived weight
- detached micro-elements are minimized
- selected state does not distort geometry
- all themes render identical geometry
- Night Shift and Night Signal both look clean
- at least one light pastel theme looks clean
- existing preset IDs and legacy mappings remain compatible
- no grouping/taxonomy work has entered the project
- no unrelated ClipNest subsystem has changed

---

# 13. Project completion artifact

When the project is complete, update this file with:

- final extension version
- exact icons changed
- any icons intentionally left geometrically unchanged
- final QA result
- Git commit hash if committed
- release/tag status if applicable

This file remains the canonical record of the icon-polish work.

---

# 14. First implementation step

Start with **Batch 1 only**:

- Knowledge
- Goals
- Shopping
- Media
- Explore

Before changing anything, inspect the exact current array entries for those five icons and the surrounding structure.

Use a read-only inspection. Do not patch until the current path data has been captured exactly.

Suggested inspection:

```bash
cd "/Users/alex/Documents/Vibe Coding/ClipNest/clipnest" || exit 1

echo "===== VERSION / STATUS ====="
grep -n '"version"' manifest.json
git status --short

echo
echo "===== BATCH 1 ICON DEFINITIONS ====="

python3 <<'PY'
from pathlib import Path
import re

text = Path("popup.js").read_text(encoding="utf-8")

ids = [
    "knowledge",
    "goals",
    "shopping",
    "media",
    "explore",
]

for icon_id in ids:
    pattern = re.compile(
        r'\{\s*'
        r'id:\s*"' + re.escape(icon_id) + r'".*?'
        r'\n\s*\}',
        re.S,
    )

    match = pattern.search(text)

    print()
    print("=" * 70)
    print(icon_id.upper())
    print("=" * 70)

    if not match:
        print("NOT FOUND")
        continue

    print(match.group(0))
PY

echo
echo "===== SVG RENDERING CONTRACT ====="
sed -n '2960,3060p' popup.js

echo
echo "===== ICON SIZE CSS ====="
sed -n '4020,4068p' popup.css
```

The output of this inspection determines the first geometry patch.

---

# 15. Final scope statement

This project polishes **all 28 existing ClipNest preset icons**.

It does not group them, categorize them, reorder them, recolor them per category, or change their stored identities.

The goal is one thing:

> Make every icon look clean, aesthetic and intentionally part of the same ClipNest family.
