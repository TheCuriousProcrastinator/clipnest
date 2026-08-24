# Clip to Notion & Obsidian - V0.1.0

A Chrome-only personal-use webpage clipper.

## Current V1 features

- Capture title, URL, site, author, main image metadata, selected text, and article/page content
- Add an editable note before saving
- Save the same normalized Markdown to Notion or Obsidian
- Notion via an internal/personal integration token
- Obsidian via Chrome File System Access, with the chosen vault handle stored in IndexedDB
- Optional Obsidian subfolder
- Default destination setting
- `Option+Shift+E` suggested shortcut on macOS
- No backend
- No account
- No analytics

## Install in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this project folder.
5. Pin the extension if desired.
6. Open the extension's **Details** page and choose **Extension options**.

## Configure Notion

This V1 intentionally uses an internal integration instead of OAuth.

1. Create an internal Notion integration in Notion's developer settings.
2. Give it permission to insert content.
3. In the target Notion database, add/share the integration connection.
4. Open the database menu -> **Manage data sources** -> the data source menu -> **Copy data source ID**.
5. In extension Settings, paste:
   - integration token
   - data source ID
6. The default title property is `Name`. Change it if your data source uses a different title column.
7. The URL property is optional. If you have a Notion URL column, enter its exact property name.
8. Click **Test Notion connection**.

The extension uses Notion API version `2026-03-11` and the current Markdown page-creation API.

## Configure Obsidian

1. Open extension Settings.
2. Click **Choose vault folder**.
3. Select the root of the Obsidian vault.
4. Optionally set a subfolder such as `Inbox/Clippings`.
5. Save settings.

The directory handle is stored in the extension's IndexedDB. The extension does not learn or store the full filesystem path.

## Test

1. Open a normal `http://` or `https://` article.
2. Optionally select some text on the page.
3. Click the extension icon.
4. Edit the title or add a note.
5. Choose Notion or Obsidian.
6. Click **Save**.

## Known V0.1 limitations

- Article extraction is deliberately heuristic, not yet Mozilla Readability-based.
- No screenshots yet.
- No persistent highlight library yet.
- No YouTube-specific transcript extraction yet.
- No Notion database picker or OAuth yet.
- No advanced Notion property form mapping yet.
- Images in captured Markdown remain linked to their original URLs.
- Some highly dynamic or locked-down pages will need site-specific extractors later.
- Chrome internal pages (`chrome://...`) cannot be captured.

## Next milestone

V0.2 should focus on extraction quality and reusable forms:

1. Bundle Mozilla Readability locally for clean article extraction.
2. Add HTML-to-Markdown normalization tests.
3. Retrieve Notion data-source schema and render supported properties automatically.
4. Add reusable capture forms/templates.
5. Add right-click save and selected-text workflows.
