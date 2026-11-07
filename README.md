# Links with Icons

**Know what a link leads to before you open it.**

Links with Icons adds recognizable file, folder, and website icons beside links in your Obsidian notes. Spot a spreadsheet among project documents, pick out a PDF in your reading list, or recognize a website in a collection of research links—without opening each link to check.

Your links keep their existing text. The icons provide an extra visual cue, making notes full of resources easier to scan.

## Why install it?

- **Find the right resource faster.** Distinguish documents, spreadsheets, presentations, media, and folders at a glance.
- **Make research lists easier to browse.** Recognize linked websites by their familiar site icons.
- **Keep project resources together.** Link to attachments in your vault or files and folders elsewhere on your computer, with visual cues beside each supported link.
- **Keep your notes readable.** Ordinary Markdown notes and unresolved vault links stay undecorated. Embedded content and code are left alone.
- **Choose the look that suits your notes.** Adjust icon size, folder appearance, and which links get icons. Include icons in PDF exports or leave them out.

Works in Live Preview and Reading View. On Windows, local files use their native application icons. macOS, Linux, and mobile use built-in file-type icons instead.

Click an attachment icon to open the file in Obsidian, or a website icon to visit the site. While Windows retrieves a native icon, a file-type icon is shown immediately.

## Examples

| In your notes | What the icon helps you recognize |
| --- | --- |
| `[[Budget.xlsx\|Project budget]]` | A spreadsheet attached to your project |
| `[[Research paper.pdf\|Read next]]` | A PDF in your reading queue |
| `[Project files](file:///C:/Projects/Example/)` | A folder on your computer |
| `[Reference](https://www.wikipedia.org)` | A website by its familiar icon |

Local file and folder examples depend on those resources being available on your device. Unresolved vault links never receive a guessed file icon, even if their names contain periods.

## Installation

In Obsidian, open **Settings → Community plugins → Browse**, search for **Links with Icons**, then install and enable it. Icons appear beside supported links automatically.

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release.
2. Inside your Obsidian vault, create a folder named `links-with-icons` under `.obsidian/plugins/`.
3. Copy the downloaded files into that folder.
4. Go to Obsidian Settings > Community Plugins, reload the list, and enable the plugin.

## Configuration

- **Icon Size**: Set the base size of icons relative to standard 16px text.
- **Dynamic Icon Sizing**: Toggle whether icons scale up proportionally in headings.
- **Link Types**: Toggle icons specifically for wiki-links, local external links, folders, or web links.
- **Folder Icon Style**: Choose between the native OS folder icon or custom Lucide folder styles.
- **Blacklisted Extensions**: Prevent specific file types (e.g. `md`, `txt`, `canvas`) from showing icons.
- **Favicon Provider & Ignored Domains**: Customize web icon providers (Google, DuckDuckGo, Icon Horse, or Direct) and exclude specific domains.
- **Web Fallback Icon**: Select the Lucide icon to use when a favicon fails to load.
- **PDF Export**: Include or omit icons in generated PDFs.

Web favicon providers receive the domain names of links displayed in a rendered note. Select the direct provider if you prefer requests to go to each linked site instead of a centralized favicon service, or disable web favicons entirely.

## Development

```powershell
npm install
npm run check
npm run build
```

Building only writes `main.js` in the repository. To deploy into a development vault, set `OBSIDIAN_PLUGIN_DIR` to the target plugin directory and run `npm run deploy`.

Release assets published from version 1.1.0 onward include GitHub build-provenance attestations. With GitHub CLI installed, an asset can be verified using:

```powershell
gh attestation verify main.js --repo Radegast546/links-with-icons
```

## License

This project is licensed under the [GNU GPLv3 License](LICENSE).

## Credits

This plugin derives some design patterns, configurations, and core web favicon concepts from the original GPL-3.0 licensed [Link Favicons](https://github.com/joethei/obsidian-link-favicon) community plugin by [joethei](https://github.com/joethei).
