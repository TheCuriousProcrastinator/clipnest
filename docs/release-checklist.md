# ClipNest Release Checklist

Use this before publishing a new ClipNest release.

## 1. Repository state

- [ ] Working tree is clean
- [ ] `main` is synchronized with `origin/main`
- [ ] `manifest.json` has the intended version
- [ ] Stable extension key has not changed
- [ ] No unintended permissions were added
- [ ] Notion still uses the existing browser session

## 2. Obsidian smoke test

- [ ] Article clipping works
- [ ] Selected Text clipping works
- [ ] Select from Page works
- [ ] Vault picker works
- [ ] Folder picker works
- [ ] Tags work
- [ ] Templates work
- [ ] Add note works
- [ ] Right-click Quick Clip works

## 3. Notion smoke test

- [ ] Preset chooser opens
- [ ] Existing preset saves normally
- [ ] New preset can be created
- [ ] Existing preset can be edited
- [ ] Preset icon can be changed
- [ ] Database destination search works
- [ ] Page destination works
- [ ] Select works and remembers its value
- [ ] Status works and remembers its value
- [ ] Generic Multi-select starts empty for a new clip
- [ ] Checkbox works
- [ ] Number works
- [ ] Date picker works
- [ ] Files & media image picker opens
- [ ] Detected webpage image is usable
- [ ] Alternate webpage image can be selected
- [ ] Actual image reaches Notion Files & media
- [ ] Author auto-populates where available
- [ ] Author remains editable before save
- [ ] Page with no detectable author remains blank

## 4. Quick Clip

- [ ] Quick Article uses the dedicated Notion preset
- [ ] Quick Selected Text uses the dedicated Notion preset
- [ ] Popup preset changes do not alter Quick Clip preset

## 5. Sync and backup

- [ ] Preset changes sync to a second Chrome installation
- [ ] Active preset sync behaves correctly
- [ ] Notion authentication remains local per computer
- [ ] Obsidian vault access remains local
- [ ] Export settings succeeds
- [ ] Import settings restores presets and mappings

## 6. Build package

- [ ] Run `python3 scripts/build-release.py`
- [ ] Builder reports no validation errors
- [ ] ZIP version matches `manifest.json`
- [ ] `manifest.json` is at ZIP root
- [ ] ZIP contains only runtime extension files
- [ ] `docs/`, `tools/`, and `scripts/` are absent from ZIP
- [ ] ZIP can be loaded with Chrome Load unpacked
- [ ] Record the SHA-256 printed by the builder

## 7. GitHub release

- [ ] Commit final release changes
- [ ] Push `main`
- [ ] Create matching `vX.Y.Z` tag/release
- [ ] Upload `clipnest-X.Y.Z.zip` as a release asset
- [ ] Confirm the release asset is downloadable
- [ ] Confirm release notes describe the user-visible changes

## 8. Chrome Web Store

- [ ] Upload the clean release ZIP
- [ ] Confirm version shown by the Store matches the manifest
- [ ] Review permission disclosures
- [ ] Confirm privacy-policy URL works
- [ ] Run one final install test from the submitted package
