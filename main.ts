import { Plugin, FileSystemAdapter, App, PluginSettingTab, Setting, Notice, setIcon, Platform } from 'obsidian';
import { ViewUpdate, PluginValue, EditorView, ViewPlugin, DecorationSet, Decoration, WidgetType } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

function getExtension(filePath: string): string {
    const lastDot = filePath.lastIndexOf('.');
    if (lastDot === -1) return '';
    const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
    if (lastSlash > lastDot) return '';
    return filePath.slice(lastDot);
}

// ── Settings ──────────────────────────────────────────────────────────

interface LinksWithIconsSettings {
    iconSize: number;
    enableInternalLinks: boolean;
    enableExternalLinks: boolean;
    enableFolderIcons: boolean;
    folderIconStyle: string;
    blacklistedExtensions: string;
    enableDiskCache: boolean;
    enableDynamicSizing: boolean;
    enableWebFavicons: boolean;
    faviconProvider: string;
    webFallbackIcon: string;
    ignoredDomains: string;
}

const DEFAULT_SETTINGS: LinksWithIconsSettings = {
    iconSize: 16,
    enableInternalLinks: true,
    enableExternalLinks: true,
    enableFolderIcons: true,
    folderIconStyle: 'native',
    blacklistedExtensions: '',
    enableDiskCache: true,
    enableDynamicSizing: true,
    enableWebFavicons: true,
    faviconProvider: 'google',
    webFallbackIcon: 'globe',
    ignoredDomains: '',
};

// ── Helper Functions ──────────────────────────────────────────────────

function getDomain(url: string): string {
    try {
        const parsed = new URL(url);
        return parsed.hostname;
    } catch {
        const match = url.match(/^(?:https?:\/\/)?(?:www\.)?([^/?#]+)/i);
        return match ? match[1] : '';
    }
}

function isIgnoredDomain(domain: string, ignoredStr: string): boolean {
    if (!ignoredStr) return false;
    const ignoredList = ignoredStr.split(',').map(d => d.trim().toLowerCase()).filter(d => d.length > 0);
    const lowerDomain = domain.toLowerCase();
    return ignoredList.some(ignored => lowerDomain === ignored || lowerDomain.endsWith('.' + ignored));
}

function getFaviconUrl(provider: string, domain: string, size: number): string {
    switch (provider) {
        case 'google':
            return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}&default_icon=404`;
        case 'duckduckgo':
            return `https://icons.duckduckgo.com/ip3/${domain}.ico`;
        case 'iconhorse':
            return `https://icon.horse/icon/${domain}?size=${size}`;
        case 'direct':
            return `https://${domain}/favicon.ico`;
        default:
            return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
    }
}

function getLucideIconForExtension(ext: string, isFolder: boolean): string {
    if (isFolder) return 'folder';
    switch (ext) {
        // Documents
        case '.md': return 'file-edit';
        case '.txt': return 'file-text';
        case '.pdf': return 'file-text';
        case '.doc':
        case '.docx': return 'file-text';
        
        // Spreadsheets
        case '.xls':
        case '.xlsx':
        case '.csv': return 'sheet';
        
        // Presentations
        case '.ppt':
        case '.pptx': return 'presentation';
        
        // Audio
        case '.mp3':
        case '.wav':
        case '.m4a':
        case '.ogg': return 'music';
        
        // Video
        case '.mp4':
        case '.mkv':
        case '.avi':
        case '.mov': return 'video';
        
        // Images
        case '.png':
        case '.jpg':
        case '.jpeg':
        case '.gif':
        case '.svg':
        case '.webp': return 'image';
        
        // Archives
        case '.zip':
        case '.rar':
        case '.7z':
        case '.tar':
        case '.gz': return 'archive';
        
        // Code
        case '.js':
        case '.ts':
        case '.json':
        case '.html':
        case '.css':
        case '.py':
        case '.cpp':
        case '.c':
        case '.rs':
        case '.go': return 'file-code';
        
        default: return 'file';
    }
}

// ── CodeMirror Widgets ────────────────────────────────────────────────

class IconWidget extends WidgetType {
    constructor(
        public queryPath: string, 
        public useAttributes: boolean, 
        public view: EditorView,
        public plugin: LinksWithIconsPlugin,
        public headingLevel: number,
        public originalLink: string
    ) {
        super();
    }

    eq(other: IconWidget) {
        return other.queryPath === this.queryPath && 
               other.useAttributes === this.useAttributes && 
               other.plugin.settings.iconSize === this.plugin.settings.iconSize &&
               other.headingLevel === this.headingLevel &&
               other.originalLink === this.originalLink &&
               other.plugin.settings.enableDynamicSizing === this.plugin.settings.enableDynamicSizing;
    }

    toDOM() {
        const scales = [1.0, 2.0, 1.7, 1.4, 1.2, 1.1, 1.0];
        const baseSize = this.plugin.settings.iconSize;
        let emSize = baseSize / 16;

        if (this.plugin.settings.enableDynamicSizing) {
            // em stays at base ratio; heading CSS naturally scales it
        } else {
            if (this.headingLevel > 0) {
                emSize = (baseSize / 16) / scales[this.headingLevel];
            }
        }

        const sizeStr = emSize + 'em';
        const span = activeDocument.createElement('span');
        span.addClass('links-with-icons-osicon');
        span.style.width = sizeStr;
        span.style.height = sizeStr;

        const ext = this.useAttributes ? this.queryPath : getExtension(this.queryPath).toLowerCase();
        const isFolder = !ext && !this.useAttributes;
        const cacheKey = this.queryPath + (this.useAttributes ? "_attr" : "_real");

        if (isFolder && this.plugin.settings.folderIconStyle !== 'native') {
            const iconId = this.plugin.settings.folderIconStyle;
            setIcon(span, iconId);
        } else if (this.plugin.iconCache[cacheKey]) {
            const img = activeDocument.createElement('img');
            img.src = this.plugin.iconCache[cacheKey];
            span.appendChild(img);
        } else if (!Platform.isWin) {
            const iconId = getLucideIconForExtension(ext, isFolder);
            setIcon(span, iconId);
        } else {
            void this.plugin.getIconForFile(this.queryPath, this.useAttributes).then((iconData) => {
                if (iconData && span.isConnected) {
                    const img = activeDocument.createElement('img');
                    img.src = iconData;
                    span.empty();
                    span.appendChild(img);
                } else if (iconData) {
                    this.view.dispatch({
                        annotations: []
                    });
                } else if (span.isConnected) {
                    const iconId = getLucideIconForExtension(ext, isFolder);
                    span.empty();
                    setIcon(span, iconId);
                }
            });
        }

        span.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const activeFile = this.plugin.app.workspace.getActiveFile();
            const sourcePath = activeFile ? activeFile.path : '';
            if (this.queryPath.match(/^[a-zA-Z]:\\/) || this.queryPath.startsWith('file:///')) {
                let target = this.queryPath;
                if (!target.startsWith('file:///')) {
                    target = 'file:///' + target.replace(/\\/g, '/');
                }
                window.open(target);
            } else {
                void this.plugin.app.workspace.openLinkText(this.originalLink, sourcePath);
            }
        });

        return span;
    }
}

class FaviconWidget extends WidgetType {
    constructor(
        public url: string,
        public domain: string,
        public plugin: LinksWithIconsPlugin,
        public headingLevel: number
    ) {
        super();
    }

    eq(other: FaviconWidget) {
        return other.url === this.url &&
               other.domain === this.domain &&
               other.plugin.settings.iconSize === this.plugin.settings.iconSize &&
               other.headingLevel === this.headingLevel &&
               other.plugin.settings.enableDynamicSizing === this.plugin.settings.enableDynamicSizing &&
               other.plugin.settings.faviconProvider === this.plugin.settings.faviconProvider;
    }

    toDOM() {
        const scales = [1.0, 2.0, 1.7, 1.4, 1.2, 1.1, 1.0];
        const baseSize = this.plugin.settings.iconSize;
        let emSize = baseSize / 16;

        if (this.plugin.settings.enableDynamicSizing) {
            // em stays at base ratio; heading CSS naturally scales it
        } else {
            if (this.headingLevel > 0) {
                emSize = (baseSize / 16) / scales[this.headingLevel];
            }
        }

        const sizeStr = emSize + 'em';
        const span = activeDocument.createElement('span');
        span.addClass('links-with-icons-favicon');
        span.style.width = sizeStr;
        span.style.height = sizeStr;

        const img = activeDocument.createElement('img');
        img.src = getFaviconUrl(this.plugin.settings.faviconProvider, this.domain, 64);
        img.onload = () => {
            if (this.plugin.settings.faviconProvider === 'google' && img.naturalWidth === 16 && img.naturalHeight === 16) {
                img.remove();
                setIcon(span, this.plugin.settings.webFallbackIcon);
            }
        };
        img.onerror = () => {
            img.remove();
            setIcon(span, this.plugin.settings.webFallbackIcon);
        };
        span.appendChild(img);

        span.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.open(this.url);
        });

        return span;
    }
}

// ── Path resolution ───────────────────────────────────────────────────

function resolveAbsolutePath(app: App, linkText: string): string | null {
    if (linkText.startsWith('file:///')) {
        let decoded = decodeURIComponent(linkText.substring(8));
        if (decoded.match(/^\/[a-zA-Z]:\//)) {
            decoded = decoded.substring(1);
        }
        return decoded;
    }
    if (linkText.match(/^[a-zA-Z]:\\/)) {
        return linkText;
    }

    const activeFile = app.workspace.getActiveFile();
    const sourcePath = activeFile ? activeFile.path : '';
    const tfile = app.metadataCache.getFirstLinkpathDest(linkText, sourcePath);
    
    if (tfile) {
        const adapter = app.vault.adapter;
        if (adapter instanceof FileSystemAdapter) {
            return adapter.getFullPath(tfile.path);
        }
    }
    return null;
}

// ── Decoration builder ────────────────────────────────────────────────

interface DecorationItem {
    from: number;
    to: number;
    type: 'osicon' | 'favicon';
    queryPath: string;
    headingLevel: number;
    useAttributes?: boolean;
    originalLink?: string;
    domain?: string;
}

function buildDecorations(view: EditorView, plugin: LinksWithIconsPlugin): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const decos: DecorationItem[] = [];
    const blacklist = plugin.getBlacklistedSet();
    const app = plugin.app;
    
    // Find all lines containing the active selection/cursor
    const selection = view.state.selection;
    const activeLines = new Set<number>();
    for (const range of selection.ranges) {
        const startLine = view.state.doc.lineAt(range.from).number;
        const endLine = view.state.doc.lineAt(range.to).number;
        for (let i = startLine; i <= endLine; i++) {
            activeLines.add(i);
        }
    }

    for (let { from, to } of view.visibleRanges) {
        const text = view.state.doc.sliceString(from, to);
        
        // Regex 1: [[link]] or [[link|alias]]
        if (plugin.settings.enableInternalLinks) {
            const regex1 = /\[\[([^\]|]+)(?:\|[^\]]*)?]\]/g;
            let match;
            while ((match = regex1.exec(text)) !== null) {
                const linkText = match[1].trim();
                const start = from + match.index;
                const ext = getExtension(linkText).toLowerCase();

                if (ext === '.md') continue;
                if (ext && blacklist.has(ext)) continue;

                const line = view.state.doc.lineAt(start);
                if (activeLines.has(line.number)) continue; // Hide icons on currently edited lines

                const headingMatch = line.text.match(/^(#{1,6})\s/);
                const headingLevel = headingMatch ? headingMatch[1].length : 0;

                const absPath = resolveAbsolutePath(app, linkText);
                if (absPath) {
                    const resolvedExt = getExtension(absPath).toLowerCase();
                    if (resolvedExt === '.md') continue;
                    if (resolvedExt && blacklist.has(resolvedExt)) continue;
                    if (!resolvedExt && !plugin.settings.enableFolderIcons) continue;
                    decos.push({
                        from: start,
                        to: start,
                        type: 'osicon',
                        queryPath: absPath,
                        useAttributes: false,
                        headingLevel,
                        originalLink: linkText
                    });
                } else if (ext) {
                    decos.push({
                        from: start,
                        to: start,
                        type: 'osicon',
                        queryPath: ext,
                        useAttributes: true,
                        headingLevel,
                        originalLink: linkText
                    });
                }
            }
        }

        // Regex 2: [label](url)
        if (plugin.settings.enableExternalLinks || plugin.settings.enableWebFavicons) {
            const regex2 = /\[[^\]]*\]\(((?:[^()]|\([^()]*\))*)\)/g;
            let match;
            while ((match = regex2.exec(text)) !== null) {
                const linkText = match[1].trim();
                const start = from + match.index;

                const line = view.state.doc.lineAt(start);
                if (activeLines.has(line.number)) continue; // Hide icons on currently edited lines

                const headingMatch = line.text.match(/^(#{1,6})\s/);
                const headingLevel = headingMatch ? headingMatch[1].length : 0;

                if (linkText.startsWith('http://') || linkText.startsWith('https://')) {
                    if (!plugin.settings.enableWebFavicons) continue;
                    const domain = getDomain(linkText);
                    if (!domain || isIgnoredDomain(domain, plugin.settings.ignoredDomains)) continue;
                    decos.push({
                        from: start,
                        to: start,
                        type: 'favicon',
                        queryPath: linkText,
                        domain,
                        headingLevel
                    });
                    continue;
                }

                // Local external file links
                if (!plugin.settings.enableExternalLinks) continue;
                const ext = getExtension(linkText).toLowerCase();
                if (ext === '.md') continue;
                if (ext && blacklist.has(ext)) continue;

                const absPath = resolveAbsolutePath(app, linkText);
                if (absPath) {
                    const resolvedExt = getExtension(absPath).toLowerCase();
                    if (resolvedExt === '.md') continue;
                    if (resolvedExt && blacklist.has(resolvedExt)) continue;
                    if (!resolvedExt && !plugin.settings.enableFolderIcons) continue;
                    decos.push({
                        from: start,
                        to: start,
                        type: 'osicon',
                        queryPath: absPath,
                        useAttributes: false,
                        headingLevel,
                        originalLink: linkText
                    });
                } else if (ext) {
                    decos.push({
                        from: start,
                        to: start,
                        type: 'osicon',
                        queryPath: ext,
                        useAttributes: true,
                        headingLevel,
                        originalLink: linkText
                    });
                }
            }
        }
    }

    decos.sort((a, b) => a.from - b.from);

    for (const deco of decos) {
        if (deco.type === 'osicon') {
            builder.add(deco.from, deco.to, Decoration.widget({
                widget: new IconWidget(
                    deco.queryPath, 
                    deco.useAttributes || false, 
                    view, 
                    plugin, 
                    deco.headingLevel,
                    deco.originalLink || ''
                ),
                side: 1
            }));
        } else {
            builder.add(deco.from, deco.to, Decoration.widget({
                widget: new FaviconWidget(
                    deco.queryPath,
                    deco.domain || '',
                    plugin,
                    deco.headingLevel
                ),
                side: 1
            }));
        }
    }

    return builder.finish();
}

// ── CodeMirror ViewPlugin ─────────────────────────────────────────────

class IconViewPlugin implements PluginValue {
    decorations: DecorationSet;

    constructor(view: EditorView, private plugin: LinksWithIconsPlugin) {
        this.decorations = buildDecorations(view, plugin);
    }

    update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
            this.decorations = buildDecorations(update.view, this.plugin);
        }
    }
}

// ── Settings Tab ──────────────────────────────────────────────────────

class LinksWithIconsSettingTab extends PluginSettingTab {
    plugin: LinksWithIconsPlugin;

    constructor(app: App, plugin: LinksWithIconsPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl).setName('Plugin configuration').setHeading();

        // ── SECTION: GENERAL ──

        new Setting(containerEl)
            .setName('Icon size')
            .setDesc('Base size of the icons in pixels (relative to standard 16px text). The icons are rendered using relative sizing (em) to automatically scale with font size and note zoom levels.')
            .addSlider(slider => slider
                .setLimits(8, 64, 2)
                .setValue(this.plugin.settings.iconSize)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.iconSize = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Dynamic icon sizing')
            .setDesc('Automatically scale icon size based on whether the link is in normal text or in a heading (H1-H6).')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableDynamicSizing)
                .onChange(async (value) => {
                    this.plugin.settings.enableDynamicSizing = value;
                    await this.plugin.saveSettings();
                }));

        // ── SECTION: LOCAL FILE ICONS ──
        new Setting(containerEl).setName('Local File Icons').setHeading();

        new Setting(containerEl)
            .setName('Show icons on internal links')
            .setDesc('Display icons for wiki-style links like [[file.xlsx]].')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableInternalLinks)
                .onChange(async (value) => {
                    this.plugin.settings.enableInternalLinks = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Show icons on external local links')
            .setDesc('Display icons for markdown-style local file links like [name](path).')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableExternalLinks)
                .onChange(async (value) => {
                    this.plugin.settings.enableExternalLinks = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Show folder icons')
            .setDesc('Display the native OS icon for links that point to folders.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableFolderIcons)
                .onChange(async (value) => {
                    this.plugin.settings.enableFolderIcons = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Folder icon appearance')
            .setDesc('Choose the icon style used for folders. Selecting a Lucide style overrides the native OS explorer folder icon.')
            .addDropdown(dropdown => dropdown
                .addOption('native', 'Native OS Icon')
                .addOption('folder', 'Lucide Folder')
                .addOption('folder-open', 'Lucide Folder Open')
                .addOption('folder-closed', 'Lucide Folder Closed')
                .addOption('folder-archive', 'Lucide Folder Archive')
                .addOption('book', 'Lucide Notebook')
                .setValue(this.plugin.settings.folderIconStyle)
                .onChange(async (value) => {
                    this.plugin.settings.folderIconStyle = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Blacklisted extensions')
            .setDesc('Comma-separated list of extensions to ignore (e.g. md, txt, canvas).')
            .addText(text => text
                .setPlaceholder('md, txt, canvas')
                .setValue(this.plugin.settings.blacklistedExtensions)
                .onChange(async (value) => {
                    this.plugin.settings.blacklistedExtensions = value;
                    await this.plugin.saveSettings();
                }));

        // ── SECTION: WEB FAVICONS ──
        new Setting(containerEl).setName('Web URL Favicons').setHeading();

        new Setting(containerEl)
            .setName('Enable web favicons')
            .setDesc('Show favicons next to external HTTP/HTTPS web links.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableWebFavicons)
                .onChange(async (value) => {
                    this.plugin.settings.enableWebFavicons = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Favicon provider')
            .setDesc('API service to use for fetching web URL favicons.')
            .addDropdown(dropdown => dropdown
                .addOption('google', 'Google')
                .addOption('duckduckgo', 'DuckDuckGo')
                .addOption('iconhorse', 'Icon Horse')
                .addOption('direct', 'Direct favicon.ico')
                .setValue(this.plugin.settings.faviconProvider)
                .onChange(async (value) => {
                    this.plugin.settings.faviconProvider = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Web fallback icon appearance')
            .setDesc('Choose the Lucide icon used when a website has no custom favicon or fails to load.')
            .addDropdown(dropdown => dropdown
                .addOption('globe', 'Lucide Globe')
                .addOption('link', 'Lucide Link')
                .addOption('external-link', 'Lucide External Link')
                .addOption('compass', 'Lucide Compass')
                .addOption('globe-2', 'Lucide Globe 2')
                .setValue(this.plugin.settings.webFallbackIcon)
                .onChange(async (value) => {
                    this.plugin.settings.webFallbackIcon = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Ignored domains')
            .setDesc('Comma-separated list of domains to ignore (e.g. github.com, google.com).')
            .addText(text => text
                .setPlaceholder('github.com, google.com')
                .setValue(this.plugin.settings.ignoredDomains)
                .onChange(async (value) => {
                    this.plugin.settings.ignoredDomains = value;
                    await this.plugin.saveSettings();
                }));

        // ── SECTION: CACHE MANAGEMENT ──
        new Setting(containerEl).setName('Local Icon Cache').setHeading();

        new Setting(containerEl)
            .setName('Persistent disk cache')
            .setDesc('Save extracted local OS icons to disk so they load instantly on restart.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableDiskCache)
                .onChange(async (value) => {
                    this.plugin.settings.enableDiskCache = value;
                    await this.plugin.saveSettings();
                    if (value) this.plugin.saveDiskCache();
                }));

        const cacheCount = Object.keys(this.plugin.iconCache).length;
        new Setting(containerEl)
            .setName('Clear icon cache')
            .setDesc(`Currently ${cacheCount} icons cached. Click to clear all cached local OS icons.`)
            .addButton(btn => btn
                .setButtonText('Clear cache')
                .setWarning()
                .onClick(async () => {
                    Object.keys(this.plugin.iconCache).forEach(k => delete this.plugin.iconCache[k]);
                    if (this.plugin.diskCachePath) {
                        const adapter = this.plugin.app.vault.adapter;
                        if (await adapter.exists(this.plugin.diskCachePath)) {
                            await adapter.remove(this.plugin.diskCachePath);
                        }
                    }
                    new Notice('Links with Icons: cache cleared. Reload your note to re-fetch icons.');
                    this.display(); // refresh count
                }));
    }
}

// ── Main Plugin ───────────────────────────────────────────────────────

export default class LinksWithIconsPlugin extends Plugin {
    settings: LinksWithIconsSettings;
    iconCache: Record<string, string> = {};
    pendingRequests: Record<string, Promise<string>> = {};
    diskCachePath: string = '';
    private saveDiskCacheTimer: ReturnType<typeof setTimeout> | null = null;
    private activeExtractions: number = 0;
    private extractionQueue: (() => void)[] = [];
    private static readonly MAX_CONCURRENT_EXTRACTIONS = 5;

    async onload() {
        console.log('loading Links with Icons plugin');

        await this.loadSettings();

        // Set up disk cache path
        const adapter = this.app.vault.adapter;
        if (adapter instanceof FileSystemAdapter) {
            const pluginDir = this.manifest.dir || '';
            this.diskCachePath = pluginDir + '/icon-cache.json';
        }
        await this.loadDiskCache();

        this.addSettingTab(new LinksWithIconsSettingTab(this.app, this));

        // 1. Register CodeMirror 6 Editor Extension (Live Preview)
        this.registerEditorExtension([
            ViewPlugin.define((view) => new IconViewPlugin(view, this), {
                decorations: (v) => v.decorations,
            })
        ]);

        // 2. Register Markdown Post-Processor (Reading View)
        this.registerMarkdownPostProcessor((el, ctx) => {
            const links = el.querySelectorAll('a');
            links.forEach((linkEl: HTMLAnchorElement) => {
                if (linkEl.querySelector('.links-with-icons-osicon') || linkEl.querySelector('.links-with-icons-favicon')) return;

                const href = linkEl.getAttribute('href') || '';
                const dataHref = linkEl.getAttribute('data-href') || '';
                const linkText = dataHref || href || '';

                if (!linkText) return;

                // Web Favicons
                if (linkText.startsWith('http://') || linkText.startsWith('https://')) {
                    if (!this.settings.enableWebFavicons) return;
                    const domain = getDomain(linkText);
                    if (!domain || isIgnoredDomain(domain, this.settings.ignoredDomains)) return;

                    let headingLevel = 0;
                    let parent = linkEl.parentElement;
                    while (parent && parent !== el) {
                        if (parent.tagName.match(/^H[1-6]$/)) {
                            headingLevel = parseInt(parent.tagName.substring(1));
                            break;
                        }
                        parent = parent.parentElement;
                    }

                    const scales = [1.0, 2.0, 1.7, 1.4, 1.2, 1.1, 1.0];
                    const baseSize = this.settings.iconSize;
                    
                    let emSize = baseSize / 16;

                    if (this.settings.enableDynamicSizing) {
                        if (headingLevel > 0) {
                            emSize = baseSize / 16;
                        }
                    } else {
                        if (headingLevel > 0) {
                            emSize = (baseSize / 16) / scales[headingLevel];
                        }
                    }

                    const span = activeDocument.createElement('span');
                    span.addClass('links-with-icons-favicon');
                    span.style.width = emSize + 'em';
                    span.style.height = emSize + 'em';

                    const img = activeDocument.createElement('img');
                    img.src = getFaviconUrl(this.settings.faviconProvider, domain, 64);
                    img.onload = () => {
                        if (this.settings.faviconProvider === 'google' && img.naturalWidth === 16 && img.naturalHeight === 16) {
                            img.remove();
                            setIcon(span, this.settings.webFallbackIcon);
                        }
                    };
                    img.onerror = () => {
                        img.remove();
                        setIcon(span, this.settings.webFallbackIcon);
                    };
                    span.appendChild(img);
                    linkEl.prepend(span);
                    return;
                }

                // Local file/folder icons (internal or external)
                const isInternal = linkEl.hasClass('internal-link');
                const isLocalExternal = !isInternal && (linkText.startsWith('file:///') || linkText.match(/^[a-zA-Z]:\\/));

                if (isInternal && !this.settings.enableInternalLinks) return;
                if (isLocalExternal && !this.settings.enableExternalLinks) return;

                if (isInternal || isLocalExternal) {
                    const ext = getExtension(linkText).toLowerCase();
                    if (ext === '.md') return;

                    const blacklist = this.getBlacklistedSet();
                    if (ext && blacklist.has(ext)) return;

                    const absPath = resolveAbsolutePath(this.app, linkText);
                    let queryPath = '';
                    let useAttributes = false;

                    if (absPath) {
                        const resolvedExt = getExtension(absPath).toLowerCase();
                        if (resolvedExt === '.md') return;
                        if (resolvedExt && blacklist.has(resolvedExt)) return;
                        if (!resolvedExt && !this.settings.enableFolderIcons) return;
                        queryPath = absPath;
                        useAttributes = false;
                    } else if (ext) {
                        queryPath = ext;
                        useAttributes = true;
                    } else {
                        return;
                    }

                    let headingLevel = 0;
                    let parent = linkEl.parentElement;
                    while (parent && parent !== el) {
                        if (parent.tagName.match(/^H[1-6]$/)) {
                            headingLevel = parseInt(parent.tagName.substring(1));
                            break;
                        }
                        parent = parent.parentElement;
                    }

                    const scales = [1.0, 2.0, 1.7, 1.4, 1.2, 1.1, 1.0];
                    const baseSize = this.settings.iconSize;
                    
                    let emSize = baseSize / 16;

                    if (this.settings.enableDynamicSizing) {
                        if (headingLevel > 0) {
                            emSize = baseSize / 16;
                        }
                    } else {
                        if (headingLevel > 0) {
                            emSize = (baseSize / 16) / scales[headingLevel];
                        }
                    }

                    const span = activeDocument.createElement('span');
                    span.addClass('links-with-icons-osicon');
                    span.style.width = emSize + 'em';
                    span.style.height = emSize + 'em';

                    const targetExt = useAttributes ? queryPath : getExtension(queryPath).toLowerCase();
                    const isFolder = !targetExt && !useAttributes;
                    const cacheKey = queryPath + (useAttributes ? "_attr" : "_real");

                    if (isFolder && this.settings.folderIconStyle !== 'native') {
                        const iconId = this.settings.folderIconStyle;
                        setIcon(span, iconId);
                    } else if (this.iconCache[cacheKey]) {
                        const img = activeDocument.createElement('img');
                        img.src = this.iconCache[cacheKey];
                        span.appendChild(img);
                    } else if (!Platform.isWin) {
                        const iconId = getLucideIconForExtension(targetExt, isFolder);
                        setIcon(span, iconId);
                    } else {
                        void this.getIconForFile(queryPath, useAttributes).then((iconData) => {
                            if (iconData && span.isConnected) {
                                const img = activeDocument.createElement('img');
                                img.src = iconData;
                                span.empty();
                                span.appendChild(img);
                            } else if (span.isConnected) {
                                const iconId = getLucideIconForExtension(targetExt, isFolder);
                                span.empty();
                                setIcon(span, iconId);
                            }
                        });
                    }
                    linkEl.prepend(span);
                }
            });
        });
    }

    onunload() {
        console.log('unloading Links with Icons plugin');
        void this.flushDiskCache();
    }

    async loadSettings() {
        const loaded = (await this.loadData()) as Record<string, unknown> | null;
        this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded || {});
    }

    async saveSettings() {
        await this.saveData(this.settings);
        // Force hot reload of editor options and redraw all decorations instantly
        this.app.workspace.updateOptions();
    }

    // ── Disk cache helpers ────────────────────────────────────────────────

    async loadDiskCache(): Promise<void> {
        if (!this.diskCachePath || !this.settings.enableDiskCache) return;
        try {
            const adapter = this.app.vault.adapter;
            if (await adapter.exists(this.diskCachePath)) {
                const data = await adapter.read(this.diskCachePath);
                const parsed = JSON.parse(data) as Record<string, string>;
                Object.assign(this.iconCache, parsed);
            }
        } catch (e) {
            console.error('Links with Icons: failed to load disk cache', e);
        }
    }

    saveDiskCache(): void {
        if (!this.diskCachePath || !this.settings.enableDiskCache) return;
        // Debounce: wait 2 seconds of inactivity before writing to disk
        if (this.saveDiskCacheTimer) window.clearTimeout(this.saveDiskCacheTimer);
        this.saveDiskCacheTimer = window.setTimeout(() => {
            void (async () => {
                try {
                    const adapter = this.app.vault.adapter;
                    await adapter.write(this.diskCachePath, JSON.stringify(this.iconCache));
                } catch (e) {
                    console.error('Links with Icons: failed to save disk cache', e);
                }
            })();
        }, 2000);
    }

    /** Flush any pending debounced disk cache write immediately. */
    async flushDiskCache(): Promise<void> {
        if (this.saveDiskCacheTimer) {
            window.clearTimeout(this.saveDiskCacheTimer);
            this.saveDiskCacheTimer = null;
        }
        if (!this.diskCachePath || !this.settings.enableDiskCache) return;
        try {
            const adapter = this.app.vault.adapter;
            await adapter.write(this.diskCachePath, JSON.stringify(this.iconCache));
        } catch (e) {
            console.error('Links with Icons: failed to save disk cache', e);
        }
    }

    // ── Icon extraction ───────────────────────────────────────────────────

    getBlacklistedSet(): Set<string> {
        return new Set(
            this.settings.blacklistedExtensions
                .split(',')
                .map(s => s.trim().toLowerCase())
                .filter(s => s.length > 0)
                .map(s => s.startsWith('.') ? s : '.' + s)
        );
    }

    private runExtraction(cacheKey: string, escapedPath: string, psBool: string): Promise<string> {
        return new Promise((resolve) => {
            // Always request Jumbo (256x256) and resize to 64x64 in C# for crispness
            const imgListIdx = 4;
            const psScript = `
Add-Type -TypeDefinition @"
using System;
using System.Drawing;
using System.Runtime.InteropServices;
public class ShellIcon {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    public struct SHFILEINFO {
        public IntPtr hIcon;
        public int iIcon;
        public uint dwAttributes;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
        public string szDisplayName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 80)]
        public string szTypeName;
    };
    [DllImport("shell32.dll", CharSet = CharSet.Auto)]
    public static extern IntPtr SHGetFileInfo(string pszPath, uint dwFileAttributes, out SHFILEINFO psfi, uint cbFileInfo, uint uFlags);
    [DllImport("shell32.dll", EntryPoint = "#727")]
    public static extern int SHGetImageList(int iImageList, ref Guid riid, ref IntPtr ppv);
    [DllImport("comctl32.dll", SetLastError = true)]
    public static extern IntPtr ImageList_GetIcon(IntPtr himl, int i, int flags);
    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool DestroyIcon(IntPtr hIcon);
    public static string GetBase64Icon(string targetPath, bool useAttr, int imageListSize) {
        SHFILEINFO shinfo = new SHFILEINFO();
        uint flags = 0x4000 | 0x1;
        if (useAttr) flags |= 0x10;
        IntPtr res = SHGetFileInfo(targetPath, 0x80, out shinfo, (uint)Marshal.SizeOf(shinfo), flags);
        if (res == IntPtr.Zero && !useAttr) {
            string ext = System.IO.Path.GetExtension(targetPath);
            if (string.IsNullOrEmpty(ext)) return "";
            flags |= 0x10;
            res = SHGetFileInfo(ext, 0x80, out shinfo, (uint)Marshal.SizeOf(shinfo), flags);
        }
        if (res == IntPtr.Zero) return "";
        Guid iidImageList = new Guid("46EB5926-582E-4017-9FDF-E8998DAA0950");
        IntPtr imageList = IntPtr.Zero;
        SHGetImageList(imageListSize, ref iidImageList, ref imageList);
        if (imageList == IntPtr.Zero) return "";
        IntPtr hIcon = ImageList_GetIcon(imageList, shinfo.iIcon, 0);
        if (hIcon == IntPtr.Zero) return "";
        Icon icon = Icon.FromHandle(hIcon);
        Bitmap bmp = icon.ToBitmap();
        Bitmap resized = new Bitmap(bmp, new System.Drawing.Size(64, 64));
        System.IO.MemoryStream ms = new System.IO.MemoryStream();
        resized.Save(ms, System.Drawing.Imaging.ImageFormat.Png);
        string b64 = Convert.ToBase64String(ms.ToArray());
        bmp.Dispose();
        resized.Dispose();
        DestroyIcon(hIcon);
        return "data:image/png;base64," + b64;
    }
}
"@ -ReferencedAssemblies System.Drawing
Write-Output ([ShellIcon]::GetBase64Icon('${escapedPath}', ${psBool}, ${imgListIdx}))
`;
            const buffer = Buffer.from(psScript, 'utf16le');
            const encodedCommand = buffer.toString('base64');

            const req = (window as unknown as { require: (module: string) => any })['require'];
            const childProcess = req('child_process') as {
                exec: (cmd: string, cb: (error: any, stdout: string) => void) => void;
            };
            childProcess.exec(`powershell -ExecutionPolicy Bypass -EncodedCommand ${encodedCommand}`, (error: any, stdout: string) => {
                this.activeExtractions--;
                this.drainExtractionQueue();

                const out = stdout.trim();
                if (error || !out) {
                    console.error('Links with Icons extraction error for', escapedPath, error || 'Empty output');
                    resolve('');
                } else {
                    this.iconCache[cacheKey] = out;
                    this.saveDiskCache();
                    resolve(out);
                }
                delete this.pendingRequests[cacheKey];
            });
        });
    }

    private drainExtractionQueue(): void {
        while (this.extractionQueue.length > 0 && this.activeExtractions < LinksWithIconsPlugin.MAX_CONCURRENT_EXTRACTIONS) {
            const next = this.extractionQueue.shift();
            if (next) next();
        }
    }

    getIconForFile(pathOrExt: string, useAttributes: boolean): Promise<string> {
        const cacheKey = pathOrExt + (useAttributes ? "_attr" : "_real");
        if (this.iconCache[cacheKey]) return Promise.resolve(this.iconCache[cacheKey]);
        if (this.pendingRequests[cacheKey] !== undefined) return this.pendingRequests[cacheKey];

        if (!Platform.isWin) {
            return Promise.resolve('');
        }

        const escapedPath = pathOrExt.replace(/'/g, "''");
        const psBool = useAttributes ? "$true" : "$false";

        const promise = new Promise<string>((resolve) => {
            const startExtraction = () => {
                this.activeExtractions++;
                void this.runExtraction(cacheKey, escapedPath, psBool).then(resolve);
            };

            if (this.activeExtractions < LinksWithIconsPlugin.MAX_CONCURRENT_EXTRACTIONS) {
                startExtraction();
            } else {
                this.extractionQueue.push(startExtraction);
            }
        });

        this.pendingRequests[cacheKey] = promise;
        return promise;
    }
}
