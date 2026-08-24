<p align="center">
  <img src="icons/icon128.png" width="96" alt="ClipNest icon">
</p>

# ClipNest

**Web Clipper for Obsidian & Notion**

A Chrome extension for saving useful things from the web directly into Obsidian or Notion.

Clip the whole article, selected text, or choose an area directly on the page.

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

This extension is currently installed manually during development.

1. Download or clone this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this repository folder.

## Privacy

Clipping and Obsidian file access happen locally in Chrome.

The extension only receives access to an Obsidian vault after you explicitly choose the folder through Chrome's folder picker.

## Status

Active development.

Current version: **0.5.18**
