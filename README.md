# Links with Icons

Links with Icons is an Obsidian community plugin that displays native OS file icons next to local file links and website favicons next to web links in both Live Preview and Reading View.

## Features

- **Local File Icons**: Displays native application icons for internal wiki-links (`[[document.xlsx]]`) and external file paths (`[Label](file:///C:/...)`), including folder icons.
- **Web Favicons**: Displays website favicons for external web links (`[Google](https://google.com)`).
- **Clickable Targets**: Clicking on the icon navigates to the target page or opens the local file/URL.
- **Zoom Sizing**: Sized using relative CSS units (`em`) so icons scale proportionally with font size and note zoom levels.
- **Dynamic Sizing**: Automatically adjusts the relative icon size depending on whether the link is in body text or in a heading (H1–H6).
- **Fallback Icons**: Provides cross-platform fallback icons using Obsidian's native Lucide library on non-Windows platforms or if favicon extraction fails.
- **Performance**: Restricts background processes to a maximum of 5 concurrent runs, and debounces cache saves to disk to minimize writes.

## Installation

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

## License

This project is licensed under the [GNU GPLv3 License](LICENSE).

## Credits

This plugin derives some design patterns, configurations, and core web favicon concepts from the original GPL-3.0 licensed [Link Favicons](https://github.com/joethei/obsidian-link-favicon) community plugin by [joethei](https://github.com/joethei).
