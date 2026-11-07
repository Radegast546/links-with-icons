# Links with Icons 1.1.2

Show file, folder, and website icons next to links in your notes. On Windows, use the familiar application icons from File Explorer.

This patch removes the remaining native document-fragment creation flagged by the 1.1.1 community review. All icon rendering now uses Obsidian's element helpers directly and adopts elements into the target document to preserve pop-out compatibility.

It retains the improvements from 1.1.1:

- Fix inline icons disappearing when the cursor moves to the end of a line, and restore icons when leaving the link or editor.
- Find plugin settings through Obsidian's settings search on version 1.13 and later.
- Preserve the existing settings interface on older supported Obsidian versions.
- Use Obsidian's DOM helpers for rendering icons, including in pop-out windows.
- Explicitly type the Windows icon-encoding helper.
- Remove deprecated settings calls and unnecessary print CSS priority.
- Clarify the README and plugin description with concrete examples.

Downloadable plugin files remain `main.js`, `manifest.json`, and `styles.css`.
