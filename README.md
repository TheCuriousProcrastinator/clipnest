<p align="center">
  <img src="icons/icon128.png" width="96" alt="ClipNest icon">
</p>

# ClipNest

**Web Clipper for Obsidian & Notion**

A Chrome extension for saving useful things from the web directly into Obsidian or Notion.

Clip articles or selected text, capture images and screenshots, or save with Quick Clip directly from Chrome's right-click menu.

## What it does

### Article

Save the main content of an article while keeping useful structure such as:

- headings
- links
- images
- lists
- blockquotes
- basic formatting

The clipper also tries to remove navigation, social controls, related posts, comments, and other page noise.

### Text

Select text on a webpage before opening the extension and save just that selection.

### Area

Choose a specific part of the webpage visually.

The clipper can also recognize repeated structured content and convert it into a Markdown table when appropriate.

### Image capture

Capture images without leaving the page:

- capture the visible area
- select an area to capture
- capture the whole page
- select an image directly from the webpage

Captured images can be included with clips while preserving the rest of your clipping workflow.

## Notion

ClipNest can save directly into Notion pages and databases using your existing logged-in Notion browser session.

Notion features include:

- reusable presets
- database and page destinations
- custom ClipNest preset icons
- title and source URL mapping
- custom database field mappings
- Select and Status properties
- Multi-select properties
- checkbox, number, and date properties
- Files & media properties
- webpage image picker
- automatic page-image detection
- automatic author detection from webpage metadata and structured book data
- editable values before saving
- dedicated Quick Clip preset
- Chrome Sync for portable preset configuration
- settings export and import

Notion authentication stays local to each computer. Preset configuration can sync through Chrome.

## Quick Clip

Right-click a webpage or selected text to save without opening the normal ClipNest popup.

Quick Clip can use its own dedicated Notion preset or your configured Obsidian destination.

For Obsidian, Chrome may ask for one-time persistent vault access setup. Choose **Allow on every visit** to keep future Quick Clips silent, including after Chrome restarts.

## Obsidian

Obsidian notes are written directly into your vault using Chrome's File System Access API.

You choose the vault once from the extension settings.

The clipper supports:

- folders
- tags
- YAML frontmatter
- Obsidian templates
- existing vault tag autocomplete
- source URL
- custom notes

Example:

```yaml
---
aliases: []
tags: 
  - example
source: "https://example.com/article"
used_in:
---
```

```markdown
# Article title

## Article

Clipped content...
```

## Templates

The extension can detect templates configured through:

- Obsidian's core Templates plugin
- Templater

Supported placeholders include:

```text
{{title}}
{{source}}
{{url}}
{{date}}
{{time}}
{{content}}
```

Templater JavaScript expressions are preserved but are not executed by the extension.

## Keyboard shortcuts

While selecting an area:

- `Esc` - cancel selection

In the popup:

- `Cmd + Enter` on macOS
- `Ctrl + Enter` on Windows/Linux

to save.

## Installation

### Chrome Web Store

Install ClipNest from the [Chrome Web Store](https://chromewebstore.google.com/detail/clipnest/bjcapemjamlbdnicmljahhjbakingmln).

### Manual installation

You can also install a packaged GitHub release manually:

1. Open the [ClipNest Releases](https://github.com/TheCuriousProcrastinator/clipnest/releases) page.
2. Download the named `clipnest-x.y.z.zip` release asset.
3. Unzip it.
4. Open `chrome://extensions`.
5. Enable **Developer mode**.
6. Click **Load unpacked**.
7. Select the unzipped ClipNest folder.

Use the named release asset rather than GitHub's automatically generated Source code ZIP.

## Sync and backups

Notion preset configuration can sync between Chrome installations signed into the same Google account.

Notion login sessions and Obsidian vault access do not sync.

Portable ClipNest settings can also be exported and imported from the Settings page.

## Privacy

ClipNest does not operate a backend service that receives clipped webpage content.

Obsidian clips are written locally through Chrome's File System Access API.

When saving to Notion, ClipNest communicates directly with Notion using the browser session already logged into Notion.

Notion login sessions and Obsidian vault permissions are not included in settings exports or ClipNest sync.

See the full [Privacy Policy](https://thecuriousprocrastinator.github.io/clipnest/privacy.html).

## Development

Development-only diagnostics live under `tools/dev/` and are not included in packaged ClipNest releases.

## Links

- [Latest releases](https://github.com/TheCuriousProcrastinator/clipnest/releases)
- [Privacy Policy](https://thecuriousprocrastinator.github.io/clipnest/privacy.html)
- [Support and issues](https://github.com/TheCuriousProcrastinator/clipnest/issues)

## Status

Active development.

Latest packaged release: **2.0.81**
