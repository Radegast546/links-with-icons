# Changelog

## 1.1.2 — 2026-11-07

- Remove native document-fragment creation from all icon rendering paths. Use Obsidian helpers directly and adopt elements into the target document for pop-out compatibility.
- Add CodeQL security analysis on pushes, pull requests, and a weekly schedule.
- Add weekly Dependabot update checks for npm dependencies and GitHub Actions.
- Remove development notes, experimental scripts, and tests from the public checkout; keep build, typecheck, lint, and security automation.

## 1.1.1 — 2026-11-07

- Add a screenshot showing file, folder, and website icons in real notes.
- Keep inline link icons visible when editing surrounding prose; restore them when leaving the link or moving focus to another pane.
- Add settings search support on Obsidian 1.13+ while retaining the settings interface on older versions.
- Use Obsidian DOM helpers in both views, preserving pop-out window compatibility.
- Explicitly type the Windows encoding helper instead of relying on a global Buffer.
- Remove deprecated settings refresh/button calls and unnecessary print CSS priority.
- Re-enable the corresponding lint rules and clarify the plugin description.

## 1.1.0 — 2026-11-07

### Added

- Web autolinks written as `<https://example.com>` now receive favicons in Live Preview.
- Configurable inclusion of local icons and favicons in PDF exports.
- Syntax-aware Live Preview link detection with regression coverage.
- Keyboard-accessible Live Preview icon widgets.
- Continuous integration on Windows and Linux.
- Build-provenance attestations for GitHub release assets.

### Fixed

- Clicking a vault attachment's icon now opens it through Obsidian, preserving its original heading or block target.
- Keep genuine 16-pixel website favicons instead of replacing them with a generic globe.
- Refresh idle Live Preview editors immediately after settings changes.
- Restore resolved attachment icons on mobile adapters without native filesystem paths.
- Preserve spaces, percent signs, and hash characters when opening external file paths.
- Ignore escaped wiki syntax, frontmatter, and hidden comments; decode escaped Markdown destinations.
- Recover safely from malformed saved settings.
- Avoid editor transactions from late native-extraction callbacks after a widget is removed.
- Restore Live Preview link detection independently of Obsidian's editor token names, and decode Windows file URLs containing encoded backslashes correctly.
- Keep unresolved vault links free of icons, including book titles containing periods such as `[[Harry Potter a Metody Racionality I.]]`.
- Resolve relative links against the note that contains them, including split panes.
- Ignore embedded images, embedded files, code blocks, link titles, and nested destination parentheses.
- Refresh Reading View when display settings change.
- Stop queued native-icon extraction and cache writes when the plugin unloads or its cache is cleared.
- Avoid repeatedly retrying native-icon extraction failures during the same session.

### Changed

- Reuse unchanged Markdown parse fragments while typing and show file-type fallback icons during native extraction.
- Added plugin lifecycle and Reading View integration tests alongside parser and settings regression tests.
- Rewritten the plugin description and introduction around finding resources faster and recognizing link destinations at a glance.
- Native extraction now uses `execFile` with a timeout instead of a shell command.
- The disk cache has a versioned format and validated image entries.
- Vault deployment is now an explicit `npm run deploy` action configured by `OBSIDIAN_PLUGIN_DIR`.
- Removed the localized, undocumented PDF-export modal injection; PDF behavior remains available in plugin settings.
