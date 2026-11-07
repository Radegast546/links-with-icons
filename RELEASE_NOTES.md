# Links with Icons 1.1.0

Recognize files, folders, and websites at a glance, so you can scan your notes faster and find the right resource.

## What changed

- **Cleaner reading lists:** unresolved wiki links no longer get misleading file icons, including book titles containing periods.
- **Open the right resource:** attachment icons open through Obsidian and relative links resolve against the note containing them, including split panes.
- **More reliable rendering:** genuine small website icons are preserved, settings refresh open notes, and mobile attachments keep their file-type icons.
- **Better Markdown handling:** embeds, code, frontmatter, hidden comments, and escaped wiki syntax stay undecorated. Link titles and nested parentheses are handled correctly.
- **PDF export control:** choose whether icons appear in exported PDFs from the plugin settings.
- **Faster feedback:** file-type icons appear while Windows retrieves native icons, and Markdown parsing reuses unchanged content while typing.
- **More robust Windows support:** fixes for encoded file paths, extraction timeouts, cancellation, and cache clearing.
- **Accessible navigation:** Live Preview icons support keyboard activation.

The plugin description and README now explain the everyday benefits and include practical examples. Ordinary Markdown notes remain undecorated. Windows uses native application icons; other platforms use built-in file-type icons.

## Installation and updates

In Obsidian, open **Settings → Community plugins**, check for updates, and update **Links with Icons**. For manual installation, copy `main.js`, `manifest.json`, and `styles.css` from this release into the existing plugin directory, then restart Obsidian.

Release assets are built in GitHub Actions and include build-provenance attestations. Validation includes automated regression tests, typechecking, linting, and a Windows native-icon smoke test.
