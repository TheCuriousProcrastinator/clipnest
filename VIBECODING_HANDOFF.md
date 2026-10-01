# VIBECODING_HANDOFF.md

## Project

**Name:** ClipNest

**Purpose:** Chrome extension for clipping web content into Obsidian and Notion.

Core product direction:

- local-first
- Obsidian writes directly to the user's vault through the Chrome File System Access API
- Notion uses the user's existing logged-in Notion browser session
- no backend for clipped content
- avoid new permissions, dependencies, cloud services, or architectural complexity unless evidence requires them
- preserve working behavior and make surgical changes

Current capabilities include:

- article clipping through the normal popup
- selected-text clipping
- visual area clipping
- page image capture
- visible-area screenshot capture
- selected-area screenshot capture
- whole-page screenshot capture
- image picker
- Obsidian folders/templates/tags/frontmatter
- Notion pages/databases/presets
- Notion field mappings
- Notion Select, Status, Multi-select, checkbox, number, date, and Files & media
- Notion author/image detection
- right-click Quick Clip
- settings import/export
- Chrome Sync for portable preset configuration

## Repository and local paths

- GitHub: `TheCuriousProcrastinator/clipnest`
- Repository visibility: **public**
- Default branch: `main`
- Active branch at handoff creation: `main`
- Only branch present in GitHub at handoff creation: `main`
- Code HEAD before this handoff-only commit: `b44906b6d79ecb2b41d0061114568bfa80c02974`
- Code commit: `Release ClipNest 2.0.83`
- Local project root: `/Users/alex/Documents/Vibe Coding/ClipNest/clipnest`
- Canonical build directory: `/Users/alex/Documents/Vibe Coding/ClipNest/clipnest/dist`
- Final delivery location for Chrome-extension release ZIPs: `/Users/alex/Downloads/`

Always verify current GitHub HEAD before changing anything because this handoff commit advances `main`.

## Current version and release state

Verified from current GitHub source:

- manifest version: **2.0.84**
- release state: **2.0.84 locally validated; release publication in progress**
- latest packaged release target: **2.0.84**
- README packaged-release marker: **2.0.84**
- previous release commit: `b44906b6d79ecb2b41d0061114568bfa80c02974` for 2.0.83
- earlier release commit: `9a80dd25c37ef4ec8dfb7b16659e5f08f8c8e8a8` for 2.0.82
- branch: `main`
- Chrome Web Store extension ID: `bjcapemjamlbdnicmljahhjbakingmln`

Historical release workflow for 2.0.83 reported:

- version bumped to 2.0.83
- release commit created
- pushed to `origin/main`
- local main matched origin/main
- README packaged-release marker updated
- canonical ZIP built as `dist/clipnest-2.0.83.zip`
- ZIP manifest version verified
- ZIP root structure verified
- no duplicate ZIP paths
- no development folders in ZIP
- source validation and JavaScript syntax checks passed

Current GitHub confirms the exact 2.0.83 release commit SHA:

`b44906b6d79ecb2b41d0061114568bfa80c02974`

Still not verifiable from GitHub:

- exact SHA-256 of `clipnest-2.0.83.zip`
- whether the final ZIP currently exists in `dist`, Downloads, or both
- current Chrome Web Store review result/status

Historical handoff says 2.0.83 was submitted for review. Treat the current store-review state as external and unverified until checked directly.

## GitHub Releases and tags

ClipNest's current 2.0.83 release flow did **not** create a GitHub Release/tag.

Current GitHub Releases include older releases such as:

- v2.0.72
- v2.0.63
- v2.0.0
- earlier 1.x releases

There is currently no GitHub Release/tag for 2.0.82 or 2.0.83.

Do not create tags or GitHub Releases for normal ClipNest releases unless explicitly requested.

## GitHub Actions

ClipNest has a release-only validation workflow:

`.github/workflows/release-validation.yml`

Allowed triggers:

- manual `workflow_dispatch`
- release/version tags matching `v*`

The workflow does not run for ordinary branch pushes or pull requests.

Release-tag validation runs source checks, builds the canonical package with `scripts/build-release.py`, and uploads the validated ZIP as a workflow artifact.

GitHub Pages deployment is separate and must not be treated as extension build/test validation.

## Manifest / platform

Current `manifest.json`:

- Manifest V3
- name: `ClipNest`
- version: `2.0.84`
- minimum Chrome version: `122`
- permissions:
  - `activeTab`
  - `scripting`
  - `storage`
  - `contextMenus`
- optional host permissions:
  - `https://*.notion.so/*`
  - `https://*.notion.com/*`
- background service worker: `background.js`
- service worker type: module
- popup: `popup.html`
- options page: `options.html`
- keyboard shortcut:
  - default: `Alt+Shift+E`
  - macOS: `Option+Shift+E`

The source manifest contains the extension key. Do not remove or alter it casually.

## Versioning rule

**Every development or test code/UI change must bump the extension version.**

Do not modify runtime code and leave the manifest on the previous version.

Documentation-only commits such as this handoff do not require an extension version bump.

## Canonical release packaging

Canonical packaging script:

`scripts/build-release.py`

Run:

```bash
python3 scripts/build-release.py
```

Normal release flow:

```text
change
-> version bump
-> source validation
-> browser testing
-> commit
-> push
-> canonical ZIP build
-> ZIP verification
-> place verified ZIP in Downloads
-> store submission
```

Canonical package:

`dist/clipnest-X.Y.Z.zip`

Do not skip the canonical `dist` build and verification step.

After verification, copy/place the final Chrome ZIP in:

`/Users/alex/Downloads/`

Do not make a production release before successful browser testing unless explicitly requested.

## Important files

### Core extension

- `manifest.json`
- `background.js`
- `popup.html`
- `popup.js`
- `popup.css`
- `options.html`
- `options.js`
- `options.css`
- `vault-store.js`
- `article-capture.js`
- `selector.js`
- `themes.js`
- `themes.css`

### Notion

- `notion-session.js`
- `notion-store.js`
- `notion-image-picker.js`
- `notion-body-media.js`

### Release

- `scripts/build-release.py`

### Documentation

- `README.md`

## 2.0.84 release: destination-specific content scope memory

### User requirement

The `Title + link` / `Page` content-scope preference must be remembered independently for:

- Obsidian
- Notion

Changing the scope in one destination must not carry that choice into the other destination.

### Implementation

`popup.js` now stores non-selected content scope per destination using:

`clipnestLastNonSelectedContentScopeByDestinationV1`

The existing single-value key remains for compatibility.

Behavior:

- Obsidian remembers its own `Title + link` or `Page` choice
- Notion remembers its own `Title + link` or `Page` choice
- switching destination restores that destination's remembered choice
- `Selected` remains contextual and does not overwrite either remembered non-selected preference
- the old Notion page-content compatibility boolean is updated only by Notion changes, so Obsidian choices no longer overwrite it

Relevant functions:

- `normalizeContentScopeDestination()`
- `getRememberedContentScope()`
- `activateRememberedContentScope()`
- `persistNonSelectedContentScope()`
- `setDestination()`
- `installContentScopeControl()`

### Validation

Validated locally on macOS in the user's real ClipNest checkout.

Source/build validation passed:

- `git diff --check`
- JavaScript syntax validation through `scripts/build-release.py`
- development package built successfully as 2.0.84
- package SHA-256 during validation:
  `fce381afdb1031f21288cc728f9795daa040101db12e5e3a3cc9d558acbf1550`

Manual browser verification passed:

- Obsidian set to `Title + link`
- Notion set to `Page`
- switching between destinations preserved each independent choice
- user confirmed: `it works`

This 2.0.84 state passed local validation and is authorized for release. Chrome Web Store upload remains a separate user action.

## 2.0.83 main feature: selected-text-only Quick Clip

### User requirement

The right-click Quick Clip UI was simplified to:

- remove right-click `Clip article`
- remove the nested `ClipNest` context submenu
- keep one direct action: `Clip selected text`
- show that action only when text is selected
- after an Obsidian selected-text Quick Clip is saved, immediately open the exact saved note in Obsidian

### Current verified source behavior

Current `background.js` uses:

`QUICK_CLIP_TEXT_MENU_ID = "clipnest.quickClip.selectedText"`

`ensureQuickClipContextMenu()` currently:

- calls `chrome.contextMenus.removeAll()`
- creates one context-menu item
- title: `Clip selected text`
- context: `selection`
- URL patterns: normal http/https webpages

The click listener only handles that selected-text menu ID.

There is no current right-click article-menu registration.

## Article compatibility path

The function:

`quickClipArticle()`

still exists intentionally.

Reason:

A Quick Clip vault-access request from a pre-2.0.83 session could already have a pending resume intent with:

`kind: "article"`

The resume dispatcher still supports:

- `selection`
- `article`

Do not remove `quickClipArticle()` only because the context-menu UI no longer exposes it unless current source/state proves the compatibility path is obsolete.

Normal popup article clipping also still exists and must be preserved.

## Selected-text Quick Clip flow

Relevant functions in `background.js`:

- `ensureQuickClipContextMenu()`
- `quickClipSelectedText()`
- `quickClipArticle()`
- `quickSaveToObsidian()`
- `getQuickSubfolder()`
- `findQuickFilename()`
- `buildQuickClipObsidianOpenUri()`
- `openQuickClipObsidianNote()`

For Obsidian Quick Clip:

1. selected text is captured
2. active vault/subfolder/template behavior is used
3. `quickSaveToObsidian(..., { returnDetails: true })` returns saved-note details
4. exact collision-safe final `filename`, `filePath`, and `vaultName` are used
5. `openQuickClipObsidianNote()` opens the exact saved note
6. a toast reports success or open failure

Do not reconstruct the final file path later from the page title.

## Collision-safe filename rule

`findQuickFilename()` owns the final saved filename.

Possible final names include:

```text
Title.md
Title (2).md
Title (3).md
```

The opener must use the exact path returned by the save operation.

## Quick Clip Obsidian URI opener

Current background opener:

- builds `obsidian://open?vault=<encoded vault>&file=<encoded exact path>`
- uses the source tab when possible
- navigates the Chrome tab to the Obsidian URI
- waits about 1.4 seconds
- retries the same URI once

Reason:

When Obsidian is not running, the first URI may only launch the app. The retry is intended to open the requested note after startup.

Do not simplify the Quick Clip path into a service-worker self-message to:

`obsidian.openSavedNote`

The service worker directly performs the Quick Clip open logic.

## Popup Obsidian opener remains separate

`popup.js` has the normal popup Obsidian open-after-save flow.

The background still exposes a message handler for:

`obsidian.openSavedNote`

This is used by extension contexts such as the popup.

Important distinction:

- normal popup save respects `obsidianOpenAfterSave`
- right-click selected-text Quick Clip to Obsidian always opens the saved note

Do not make the popup behavior unconditional.

## Quick Clip destination behavior

Quick Clip still respects the configured destination:

- Obsidian
- Notion

For Notion:

- use the configured dedicated Quick Clip Notion preset
- do not open Obsidian

For Obsidian:

- use configured active vault/subfolder/template behavior
- save using persistent File System Access handle
- immediately open the exact saved note

## Quick Clip permission/access architecture

Preserve:

- active Obsidian vault selection
- persistent File System Access handle
- first-use permission handoff
- pending Quick Clip resume intent
- multi-vault behavior

Relevant pending access state uses:

`clipnestQuickClipAccessIntentV1`

Historical intent TTL: 5 minutes.

The popup can request file-system permission from a real user click, then the service worker resumes the original Quick Clip operation.

Do not break this resume architecture while changing Quick Clip.

## Current known-good browser verification

Historical user verification for 2.0.83:

`it works`

The user accepted the selected-text Quick Clip behavior and requested release.

Treat the overall 2.0.83 feature as user-accepted before release.

Individual cases were not separately documented as explicit passes:

- no menu item without text selection
- direct item with no submenu
- duplicate-title collision-safe exact second-note open
- cold-launch Obsidian retry behavior
- Notion selected-text Quick Clip regression

These remain useful regression checks, but do not claim separate historical verification.

## 2.0.82 theme regression baseline

The user explicitly reported:

`regression passed`

Preserve the 2.0.82 light-theme fixes, including:

- readable Notion semantic-color chips in light themes
- visible preset-builder trash icons
- visible `Ask each time` mapping controls

Before changing behavior because something appears visually missing:

1. verify JS creates it
2. verify DOM/state
3. inspect final CSS/theme specificity
4. only then change behavior

## Stable older behavior to preserve

### Whole-page screenshots

Known safeguards:

```text
maxOutputHeight: 16000
maxCanvasPixels: 16000000
```

Output should scale rather than crop.

Do not rewrite this path without evidence.

### Notion preset async schema isolation

Preserve stale-result guards such as:

```js
if (notionPresetBuilderDraft !== draft) return;
```

### Notion preset-name isolation

Persistence serializes draft state.

Do not reintroduce DOM-to-draft preset-name overwrites during preset switching.

### Logged-out Notion behavior

Cached presets may open while signed out.

Authentication occurs at save time.

Do not restore the old preset-opening authentication gate.

### Failed-save auth recovery

When save fails specifically because the Notion browser session is missing:

- preserve form state
- replace the full form with sign-in UI
- do not leave form fields visible underneath
- do not show generic red Notion write failure
- use existing resume machinery

### Live-schema fallback

If live Notion schema refresh is unavailable because of signed-out/offline/unavailable state, silently fall back to cached schema.

Do not fill Chrome's extension Errors page for this expected path.

## Context-menu migration decision

At the time of the 2.0.83 change, all `chrome.contextMenus.create()` registrations belonged to Quick Clip.

That made `chrome.contextMenus.removeAll()` appropriate for removing stale pre-2.0.83 nested menu items.

Do not assume this remains safe forever.

If future context-menu features are added, inspect all registrations before continuing to reset all menus globally.

## Failed approaches and debugging findings

### Python re.VERBOSE patch failure

A prior patch attempt failed while trying to update the `quickSaveToObsidian()` signature.

Cause:

- patch regex used `re.VERBOSE`
- literal spaces were ignored
- pattern did not match current source

Rollback restored source.

Do not repeat that patch strategy.

For surgical patches prefer:

- exact literal replacement when source is known
- tightly bounded ranges
- explicit occurrence counts
- assertions before writing

### Interactive zsh comments

A long pasted shell block previously failed with:

`zsh: command not found: #`

Interactive comments were disabled.

For complex shell blocks prefer:

```bash
bash <<'BASH'
...
BASH
```

Avoid shell `#` comment lines inside copy-paste Terminal blocks.

### zsh `status`

`status` is a read-only special zsh variable.

Do not assign:

`status=$?`

Use something like:

`exit_code=$?`

## Fixed issues

### Released in 2.0.82

- unreadable Notion semantic-color chips in light themes
- nearly invisible preset-builder trash icons in light themes
- nearly invisible `Ask each time` mapping control in light themes

### Released in 2.0.84

- `Title + link` / `Page` preference is remembered independently for Obsidian and Notion
- switching destinations restores each destination's own preference
- contextual `Selected` behavior remains separate from remembered non-selected preferences

### Released in 2.0.83

- removed right-click `Clip article`
- removed nested ClipNest context submenu
- direct `Clip selected text` action
- selection-only context-menu visibility
- Obsidian selected-text Quick Clip opens saved note immediately
- exact collision-safe saved path is used
- pending pre-upgrade article resume compatibility preserved

## Open / unverified

No active coding bug is recorded at this handoff point.

Still unverified from current GitHub:

- exact 2.0.83 ZIP SHA-256
- whether ZIP currently exists in `dist`, Downloads, or both
- current Chrome Web Store review result
- explicit cold-launch Obsidian Quick Clip test
- explicit duplicate-title/collision-safe open test
- explicit Notion selected-text Quick Clip regression after 2.0.83

Check these only when relevant.

## Deferred / preserved behavior

Do not remove or rewrite without a separate task and evidence:

- `quickClipArticle()` pending-intent compatibility path
- normal popup article clipping
- popup `obsidianOpenAfterSave` setting
- multi-vault storage
- Quick Clip persistent vault-access setup
- Notion Quick Clip preset system
- full-page screenshot implementation
- Notion authentication/resume architecture
- theme system

## Backlog

No new feature was selected after 2.0.84.

Current practical backlog:

- respond to Chrome Web Store review feedback if actionable feedback exists
- verify external store-review status only when needed
- if development resumes, inspect current repo first and work on the next user-requested task
- optionally run/document individual 2.0.83 regression cases:
  - duplicate-title collision-safe open
  - cold-launch Obsidian
  - Notion selected-text Quick Clip

Do not invent a broader backlog.

## Exact next development task

There is no preselected new feature.

At the start of the next development chat:

1. verify current GitHub/source still matches this handoff
2. verify branch and manifest version
3. verify current Chrome Web Store review status only if the user asks about it or it affects the next task
4. if review feedback exists, address that first
5. otherwise work on the user's next requested ClipNest feature/bug

Do not make speculative changes while store review is pending.

## Suggested local state check

```bash
cd "/Users/alex/Documents/Vibe Coding/ClipNest/clipnest" || exit 1
set -e
export GIT_PAGER=cat

git fetch origin
git switch main
git pull --ff-only origin main

printf '===== VERSION =====\n'
grep -n '"version"' manifest.json

printf '\n===== GIT =====\n'
git status --short --branch
git --no-pager log -5 --oneline --decorate

printf '\n===== README RELEASE MARKER =====\n'
grep -n 'Latest packaged release' README.md || true

printf '\n===== 2.0.84 PACKAGE LOCATIONS =====\n'
for f in "dist/clipnest-2.0.84.zip" "/Users/alex/Downloads/clipnest-2.0.84.zip"; do
  if [ -f "$f" ]; then
    echo "FOUND: $f"
    ls -lh "$f"
    shasum -a 256 "$f"
  else
    echo "NOT FOUND: $f"
  fi
done
```

Expected source state:

- branch `main`
- version `2.0.84`
- latest packaged/released version `2.0.84`
- README latest packaged release `2.0.84`
- direct selection-only context action
- no article context-menu UI
- `quickClipArticle()` still present for compatibility

## Handoff maintenance rule

Every meaningful future development commit must update this file with enough context for a fresh ChatGPT session to continue without prior conversation context.

Update the handoff whenever a commit changes:

- feature behavior
- bug behavior
- architecture
- important implementation decisions
- version/release state
- debugging findings
- validation/test status
- known issues
- exact next task

Keep this document current-state focused rather than chronological.

## Prompt for the next ChatGPT session

Read the full handoff first.

Treat it as historical context, but verify the current GitHub repository, branch, HEAD, manifest version, README release marker, and relevant source before making changes.

Identify meaningful differences between this handoff and the current code.

Never guess about implementation details that can be inspected.

Preserve existing working behavior and continue from the current verified state.

For release work, preserve ClipNest's rule that every code/UI test change bumps the version, browser testing happens before production release, `scripts/build-release.py` builds the canonical ZIP, and the verified release ZIP is then placed in `/Users/alex/Downloads/`.


<!-- VIBE-CI-POLICY-2026-09-30 -->
## Local validation and GitHub Actions policy

This section is authoritative and supersedes older CI wording elsewhere in this handoff.

- Normal development is validated in the user's actual local checkout before any GitHub write.
- Only the exact locally tested files may be committed and pushed.
- GitHub Actions is not the routine development validation loop.
- Ordinary feature-branch pushes, ordinary `main` pushes, and pull requests must not automatically trigger GitHub Actions.
- If a GitHub Actions workflow exists, it may run only when explicitly started with `workflow_dispatch` or from a release/version tag such as `v1.0.2`.
- Do not broaden automatic CI triggers without the user's explicit approval.
- Use the project's existing local build/test process before committing. For Xcode projects, use `xcodebuild` unless the project specifies otherwise, and leave the freshly built development app running for manual testing when relevant.
- UI, interaction, layout, animation, drag/drop, focus, persistence, timing, and similar behavior changes require explicit user confirmation after local testing.
- A documentation-only handoff update does not require rebuilding.
- Release requests still require local validation first; release-tag GitHub Actions may then provide the final clean-environment validation.
