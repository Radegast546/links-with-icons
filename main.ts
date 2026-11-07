import {
    Plugin,
    FileSystemAdapter,
    App,
    PluginSettingTab,
    Setting,
    Notice,
    setIcon,
    Platform,
    editorInfoField,
    MarkdownView,
    parseLinktext,
    type SettingDefinitionItem,
} from 'obsidian';
import { ViewUpdate, PluginValue, EditorView, ViewPlugin, DecorationSet, Decoration, WidgetType } from '@codemirror/view';
import { RangeSetBuilder, type EditorState } from '@codemirror/state';
import { parser as markdownParser } from '@lezer/markdown';
import { TreeFragment, type Tree, type ChangedRange } from '@lezer/common';
import { collectMarkdownLinks, type TextRange } from './src/markdown-links';
import { loadValidatedSettings, type LinksWithIconsSettings } from './src/settings';
import {
    fileUriToWindowsPath,
    getDomain,
    getExtension,
    getFaviconUrl,
    getLucideIconForExtension,
    getLocalIconTarget,
    isAbsoluteLocalPath,
    isHttpUrl,
    isIgnoredDomain,
    normalizeMarkdownDestination,
    localPathToFileUri,
} from './src/link-utils';

// ── Settings ──────────────────────────────────────────────────────────

// ── CodeMirror Widgets ────────────────────────────────────────────────

const HEADING_SCALES = [1, 2, 1.7, 1.4, 1.2, 1.1, 1];

function getIconSizeEm(settings: LinksWithIconsSettings, headingLevel: number): number {
    const baseSize = settings.iconSize / 16;
    if (settings.enableDynamicSizing || headingLevel === 0) return baseSize;
    return baseSize / (HEADING_SCALES[headingLevel] ?? 1);
}

function makeWidgetAccessible(element: HTMLElement, label: string, activate: () => void): void {
    element.setAttribute('role', 'link');
    element.setAttribute('aria-label', label);
    element.tabIndex = 0;
    element.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        activate();
    });
    element.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        activate();
    });
}

class IconWidget extends WidgetType {
    constructor(
        private readonly queryPath: string,
        private readonly useAttributes: boolean,
        private readonly view: EditorView,
        private readonly plugin: LinksWithIconsPlugin,
        private readonly headingLevel: number,
        private readonly originalLink: string,
        private readonly sourcePath: string,
        private readonly settingsRevision: number,
    ) {
        super();
    }

    eq(other: IconWidget): boolean {
        return other.queryPath === this.queryPath
            && other.useAttributes === this.useAttributes
            && other.headingLevel === this.headingLevel
            && other.originalLink === this.originalLink
            && other.sourcePath === this.sourcePath
            && other.settingsRevision === this.settingsRevision;
    }

    toDOM(): HTMLElement {
        const ownerDocument = this.view.dom.ownerDocument;
        const span = ownerDocument.createDocumentFragment().createSpan();
        const size = `${getIconSizeEm(this.plugin.settings, this.headingLevel)}em`;
        span.addClass('links-with-icons-osicon');
        span.toggleClass('links-with-icons-hide-in-pdf', this.plugin.settings.hideIconsInPdf);
        span.style.width = size;
        span.style.height = size;

        const ext = this.useAttributes ? this.queryPath : getExtension(this.queryPath).toLowerCase();
        const isFolder = !ext && !this.useAttributes;
        const cacheKey = this.plugin.getIconCacheKey(this.queryPath, this.useAttributes);
        const cachedIcon = this.plugin.iconCache[cacheKey];

        if (isFolder && this.plugin.settings.folderIconStyle !== 'native') {
            setIcon(span, this.plugin.settings.folderIconStyle);
        } else if (cachedIcon) {
            const img = ownerDocument.createDocumentFragment().createEl('img');
            img.src = cachedIcon;
            span.appendChild(img);
        } else if (!Platform.isWin) {
            setIcon(span, getLucideIconForExtension(ext, isFolder));
        } else {
            // A usable icon is visible immediately, even while native extraction is pending.
            setIcon(span, getLucideIconForExtension(ext, isFolder));
            void this.plugin.getIconForFile(this.queryPath, this.useAttributes).then((iconData) => {
                if (this.settingsRevision !== this.plugin.settingsRevision) return;
                if (iconData && span.isConnected) {
                    const img = ownerDocument.createDocumentFragment().createEl('img');
                    img.src = iconData;
                    span.empty();
                    span.appendChild(img);
                } else if (span.isConnected) {
                    span.empty();
                    setIcon(span, getLucideIconForExtension(ext, isFolder));
                }
            });
        }

        makeWidgetAccessible(span, `Open ${this.originalLink}`, () => {
            if (isAbsoluteLocalPath(this.originalLink)) {
                ownerDocument.defaultView?.open(localPathToFileUri(this.originalLink), '_blank', 'noopener');
            } else {
                void this.plugin.app.workspace.openLinkText(this.originalLink, this.sourcePath);
            }
        });
        return span;
    }
}

class FaviconWidget extends WidgetType {
    constructor(
        private readonly url: string,
        private readonly domain: string,
        private readonly view: EditorView,
        private readonly plugin: LinksWithIconsPlugin,
        private readonly headingLevel: number,
        private readonly settingsRevision: number,
    ) {
        super();
    }

    eq(other: FaviconWidget): boolean {
        return other.url === this.url
            && other.domain === this.domain
            && other.headingLevel === this.headingLevel
            && other.settingsRevision === this.settingsRevision;
    }

    toDOM(): HTMLElement {
        const ownerDocument = this.view.dom.ownerDocument;
        const span = ownerDocument.createDocumentFragment().createSpan();
        const size = `${getIconSizeEm(this.plugin.settings, this.headingLevel)}em`;
        span.addClass('links-with-icons-favicon');
        span.toggleClass('links-with-icons-hide-in-pdf', this.plugin.settings.hideIconsInPdf);
        span.style.width = size;
        span.style.height = size;

        const img = ownerDocument.createDocumentFragment().createEl('img');
        img.src = getFaviconUrl(this.plugin.settings.faviconProvider, this.domain, 64);
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        img.onerror = () => {
            img.remove();
            setIcon(span, this.plugin.settings.webFallbackIcon);
        };
        span.appendChild(img);

        makeWidgetAccessible(span, `Open ${this.domain}`, () => {
            ownerDocument.defaultView?.open(this.url, '_blank', 'noopener');
        });
        return span;
    }
}

// ── Path resolution ───────────────────────────────────────────────────

function resolveAbsolutePath(app: App, linkText: string, sourcePath: string): string | null {
    const parsedLink = parseLinktext(linkText).path || linkText;
    const fileUriPath = fileUriToWindowsPath(parsedLink);
    if (fileUriPath) return fileUriPath;
    if (/^[a-zA-Z]:[\\/]/.test(parsedLink) || /^\\\\[^\\]/.test(parsedLink)) return parsedLink;

    const tfile = app.metadataCache.getFirstLinkpathDest(parsedLink, sourcePath);
    
    if (tfile) {
        const adapter = app.vault.adapter;
        if (adapter instanceof FileSystemAdapter) {
            return adapter.getFullPath(tfile.path);
        }
        // Mobile adapters have no native absolute path, but still resolve vault attachments.
        return tfile.path;
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

function getEditorSourcePath(state: EditorState): string {
    return state.field(editorInfoField, false)?.file?.path ?? '';
}

function getVisibleLineRanges(view: EditorView): TextRange[] {
    return view.visibleRanges.map(({ from, to }) => {
        const startLine = view.state.doc.lineAt(from);
        const endPosition = Math.max(from, Math.min(to, view.state.doc.length));
        const endLine = view.state.doc.lineAt(endPosition);
        return { from: startLine.from, to: endLine.to };
    });
}

function buildDecorations(view: EditorView, plugin: LinksWithIconsPlugin, tree: Tree): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const decos: DecorationItem[] = [];
    const blacklist = plugin.getBlacklistedSet();
    const sourcePath = getEditorSourcePath(view.state);
    
    const documentText = view.state.doc.toString();
    const links = collectMarkdownLinks(documentText, tree, getVisibleLineRanges(view));
    for (const link of links) {
        if (link.kind === 'wiki' && !plugin.settings.enableInternalLinks) continue;
        const linkText = link.kind === 'markdown' ? normalizeMarkdownDestination(link.target) : link.target;
        const line = view.state.doc.lineAt(link.from);
        // Editing surrounding prose must not hide the link's icon. Also ignore a
        // retained selection when focus moves to another pane or out of the editor.
        const editingLink = view.hasFocus && view.state.selection.ranges.some((range) =>
            range.empty
                ? range.from >= link.from && range.from < link.to
                : range.from < link.to && range.to > link.from,
        );
        if (editingLink) continue;

        const headingMatch = line.text.match(/^\s{0,3}(#{1,6})(?:\s|$)/);
        const headingLevel = headingMatch?.[1]?.length ?? 0;

        if (isHttpUrl(linkText)) {
            if (!plugin.settings.enableWebFavicons) continue;
            const domain = getDomain(linkText);
            if (!domain || isIgnoredDomain(domain, plugin.settings.ignoredDomains)) continue;
            decos.push({
                from: link.from,
                to: link.from,
                type: 'favicon',
                queryPath: linkText,
                domain,
                headingLevel,
            });
            continue;
        }

        if (link.kind === 'markdown' && !plugin.settings.enableExternalLinks) continue;
        const linkPath = parseLinktext(linkText).path || linkText;
        const ext = getExtension(linkPath).toLowerCase();
        if (ext === '.md' || (ext && blacklist.has(ext))) continue;

        const absPath = resolveAbsolutePath(plugin.app, linkPath, sourcePath);
        const iconTarget = getLocalIconTarget(linkPath, absPath);
        if (!iconTarget) continue;
        if (absPath) {
            const resolvedExt = getExtension(absPath).toLowerCase();
            if (resolvedExt === '.md' || (resolvedExt && blacklist.has(resolvedExt))) continue;
            if (!resolvedExt && !plugin.settings.enableFolderIcons) continue;
            decos.push({
                from: link.from,
                to: link.from,
                type: 'osicon',
                queryPath: absPath,
                useAttributes: false,
                headingLevel,
                originalLink: linkText,
            });
        } else {
            decos.push({
                from: link.from,
                to: link.from,
                type: 'osicon',
                queryPath: iconTarget.queryPath,
                useAttributes: iconTarget.useAttributes,
                headingLevel,
                originalLink: linkText,
            });
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
                    deco.originalLink || '',
                    sourcePath,
                    plugin.settingsRevision,
                ),
                side: 1
            }));
        } else {
            builder.add(deco.from, deco.to, Decoration.widget({
                widget: new FaviconWidget(
                    deco.queryPath,
                    deco.domain || '',
                    view,
                    plugin,
                    deco.headingLevel,
                    plugin.settingsRevision,
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
    private tree: Tree;
    private revision: number;
    private readonly refresh: () => void;

    constructor(view: EditorView, private plugin: LinksWithIconsPlugin) {
        // Obsidian's editor token tree does not guarantee CommonMark Link/URL nodes.
        // Own the parser used by collection instead of depending on host node names.
        this.tree = markdownParser.parse(view.state.doc.toString());
        this.revision = plugin.settingsRevision;
        this.decorations = buildDecorations(view, plugin, this.tree);
        this.refresh = () => view.dispatch({});
        plugin.editorRefreshCallbacks.add(this.refresh);
    }

    update(update: ViewUpdate) {
        if (update.docChanged) {
            const changes: ChangedRange[] = [];
            update.changes.iterChangedRanges((fromA, toA, fromB, toB) => changes.push({ fromA, toA, fromB, toB }));
            const fragments = TreeFragment.applyChanges(TreeFragment.addTree(this.tree), changes);
            this.tree = markdownParser.parse(update.state.doc.toString(), fragments);
        }
        if (update.docChanged || update.viewportChanged || update.selectionSet || update.focusChanged
            || this.revision !== this.plugin.settingsRevision || update.startState !== update.state) {
            this.revision = this.plugin.settingsRevision;
            this.decorations = buildDecorations(update.view, this.plugin, this.tree);
        }
    }

    destroy(): void {
        this.plugin.editorRefreshCallbacks.delete(this.refresh);
    }
}

// ── Settings Tab ──────────────────────────────────────────────────────

interface SettingsRow {
    name: string;
    desc?: string;
    heading?: boolean;
    configure?: (setting: Setting) => void;
}

class LinksWithIconsSettingTab extends PluginSettingTab {
    constructor(app: App, private readonly plugin: LinksWithIconsPlugin) {
        super(app, plugin);
    }

    getSettingDefinitions(): SettingDefinitionItem[] {
        return this.settingRows().map((row) => ({
            name: row.name,
            desc: row.desc,
            searchable: !row.heading,
            render: (setting: Setting) => {
                if (row.heading) setting.setHeading();
                row.configure?.(setting);
            },
        }));
    }

    // Compatibility path for Obsidian versions before declarative settings were introduced.
    display(): void {
        this.containerEl.empty();
        for (const row of this.settingRows()) {
            const setting = new Setting(this.containerEl).setName(row.name);
            if (row.desc) setting.setDesc(row.desc);
            if (row.heading) setting.setHeading();
            row.configure?.(setting);
        }
    }

    private settingRows(): SettingsRow[] {
        const cacheCount = Object.keys(this.plugin.iconCache).length;
        return [
            { name: "Plugin configuration", heading: true },
            { name: "Icon size", desc: 'Base size of the icons in pixels (relative to standard 16px text). The icons are rendered using relative sizing (em) to automatically scale with font size and note zoom levels.', configure: (setting) => { setting.addSlider(slider => slider
                .setLimits(8, 64, 2)
                .setValue(this.plugin.settings.iconSize)
                .onChange(async (value) => {
                    this.plugin.settings.iconSize = value;
                    await this.plugin.saveSettings();
                })); } },
            { name: "Dynamic icon sizing", desc: 'Automatically scale icon size based on whether the link is in normal text or in a heading (H1-H6).', configure: (setting) => { setting.addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableDynamicSizing)
                .onChange(async (value) => {
                    this.plugin.settings.enableDynamicSizing = value;
                    await this.plugin.saveSettings();
                })); } },
            { name: "Export icons to PDF", desc: 'Include local OS icons and web URL favicons when exporting notes to PDF.', configure: (setting) => { setting.addToggle(toggle => toggle
                .setValue(!this.plugin.settings.hideIconsInPdf)
                .onChange(async (value) => {
                    this.plugin.settings.hideIconsInPdf = !value;
                    await this.plugin.saveSettings();
                })); } },
            { name: "Local file icons", heading: true },
            { name: "Show icons on internal links", desc: 'Display icons for wiki-style links like [[file.xlsx]].', configure: (setting) => { setting.addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableInternalLinks)
                .onChange(async (value) => {
                    this.plugin.settings.enableInternalLinks = value;
                    await this.plugin.saveSettings();
                })); } },
            { name: "Show icons on external local links", desc: 'Display icons for Markdown-style local file links like [name](path).', configure: (setting) => { setting.addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableExternalLinks)
                .onChange(async (value) => {
                    this.plugin.settings.enableExternalLinks = value;
                    await this.plugin.saveSettings();
                })); } },
            { name: "Show folder icons", desc: 'Display the native OS icon for links that point to folders.', configure: (setting) => { setting.addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableFolderIcons)
                .onChange(async (value) => {
                    this.plugin.settings.enableFolderIcons = value;
                    await this.plugin.saveSettings();
                })); } },
            { name: "Folder icon appearance", desc: 'Choose the icon style used for folders. Selecting a Lucide style overrides the native OS explorer folder icon.', configure: (setting) => { setting.addDropdown(dropdown => dropdown
                .addOption('native', 'Native OS icon')
                .addOption('folder', 'Lucide folder')
                .addOption('folder-open', 'Lucide folder open')
                .addOption('folder-closed', 'Lucide folder closed')
                .addOption('folder-archive', 'Lucide folder archive')
                .addOption('book', 'Lucide notebook')
                .setValue(this.plugin.settings.folderIconStyle)
                .onChange(async (value) => {
                    this.plugin.settings.folderIconStyle = value;
                    await this.plugin.saveSettings();
                })); } },
            { name: "Blacklisted extensions", desc: 'Comma-separated list of file extensions to ignore.', configure: (setting) => { setting.addText(text => text
                .setPlaceholder('Extensions separated by commas')
                .setValue(this.plugin.settings.blacklistedExtensions)
                .onChange(async (value) => {
                    this.plugin.settings.blacklistedExtensions = value;
                    await this.plugin.saveSettings();
                })); } },
            { name: "Web URL favicons", heading: true },
            { name: "Enable web favicons", desc: 'Show favicons next to external web links.', configure: (setting) => { setting.addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableWebFavicons)
                .onChange(async (value) => {
                    this.plugin.settings.enableWebFavicons = value;
                    await this.plugin.saveSettings();
                })); } },
            { name: "Favicon provider", desc: 'Service used to fetch web URL favicons.', configure: (setting) => { setting.addDropdown(dropdown => dropdown
                .addOption('google', 'Google')
                .addOption('duckduckgo', 'DuckDuckGo')
                .addOption('iconhorse', 'Icon Horse')
                .addOption('direct', 'Direct favicon.ico')
                .setValue(this.plugin.settings.faviconProvider)
                .onChange(async (value) => {
                    this.plugin.settings.faviconProvider = value;
                    await this.plugin.saveSettings();
                })); } },
            { name: "Web fallback icon appearance", desc: 'Choose the Lucide icon used when a website has no custom favicon or fails to load.', configure: (setting) => { setting.addDropdown(dropdown => dropdown
                .addOption('globe', 'Lucide globe')
                .addOption('link', 'Lucide link')
                .addOption('external-link', 'Lucide external link')
                .addOption('compass', 'Lucide compass')
                .addOption('globe-2', 'Lucide globe 2')
                .setValue(this.plugin.settings.webFallbackIcon)
                .onChange(async (value) => {
                    this.plugin.settings.webFallbackIcon = value;
                    await this.plugin.saveSettings();
                })); } },
            { name: "Ignored domains", desc: 'Comma-separated list of domains to ignore, such as example.com.', configure: (setting) => { setting.addText(text => text
                .setPlaceholder('github.com, google.com')
                .setValue(this.plugin.settings.ignoredDomains)
                .onChange(async (value) => {
                    this.plugin.settings.ignoredDomains = value;
                    await this.plugin.saveSettings();
                })); } },
            { name: "Local icon cache", heading: true },
            { name: "Persistent disk cache", desc: 'Save extracted local OS icons to disk so they load instantly on restart.', configure: (setting) => { setting.addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableDiskCache)
                .onChange(async (value) => {
                    this.plugin.settings.enableDiskCache = value;
                    await this.plugin.saveSettings();
                    await this.plugin.setDiskCacheEnabled(value);
                })); } },
            { name: "Clear icon cache", desc: `Currently ${cacheCount} icons cached. Click to clear all cached local OS icons.`, configure: (setting) => { setting.addButton(btn => btn
                .setButtonText('Clear cache')
                .onClick(async () => {
                    await this.plugin.clearIconCache();
                    new Notice('Icon cache cleared.');
                    setting.setDesc(`Currently ${Object.keys(this.plugin.iconCache).length} icons cached. Click to clear all cached local OS icons.`);
                })); } },
        ];
    }
}

// ── Main Plugin ───────────────────────────────────────────────────────

interface ExtractionJob {
    cacheKey: string;
    pathOrExt: string;
    useAttributes: boolean;
    generation: number;
    resolve: (iconData: string) => void;
    request: Promise<string>;
}

interface ChildProcessHandle {
    kill: () => boolean;
}

interface DiskCachePayload {
    version: number;
    icons: Record<string, string>;
}

export default class LinksWithIconsPlugin extends Plugin {
    readonly editorRefreshCallbacks = new Set<() => void>();
    settings!: LinksWithIconsSettings;
    settingsRevision = 0;
    iconCache: Record<string, string> = {};
    diskCachePath: string = '';
    private readonly pendingRequests = new Map<string, Promise<string>>();
    private readonly failedExtractions = new Set<string>();
    private readonly activeProcesses = new Set<ChildProcessHandle>();
    private saveDiskCacheTimer: number | null = null;
    private diskCacheWritePromise: Promise<void> | null = null;
    private activeExtractions = 0;
    private extractionQueue: ExtractionJob[] = [];
    private cacheGeneration = 0;
    private cacheRevision = 0;
    private cacheDirty = false;
    private isUnloading = false;
    private static readonly MAX_CONCURRENT_EXTRACTIONS = 5;
    private static readonly DISK_CACHE_VERSION = 1;

    async onload(): Promise<void> {
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
                if (isHttpUrl(linkText)) {
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

                    const emSize = getIconSizeEm(this.settings, headingLevel);
                    const ownerDocument = linkEl.ownerDocument;
                    const span = ownerDocument.createDocumentFragment().createSpan();
                    span.addClass('links-with-icons-favicon');
                    span.toggleClass('links-with-icons-hide-in-pdf', this.settings.hideIconsInPdf);
                    span.style.width = emSize + 'em';
                    span.style.height = emSize + 'em';

                    const img = ownerDocument.createDocumentFragment().createEl('img');
                    img.src = getFaviconUrl(this.settings.faviconProvider, domain, 64);
                    img.alt = '';
                    img.referrerPolicy = 'no-referrer';
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
                const isLocalExternal = !isInternal && isAbsoluteLocalPath(linkText);

                if (isInternal && !this.settings.enableInternalLinks) return;
                if (isLocalExternal && !this.settings.enableExternalLinks) return;

                if (isInternal || isLocalExternal) {
                    const linkPath = parseLinktext(linkText).path || linkText;
                    const ext = getExtension(linkPath).toLowerCase();
                    if (ext === '.md') return;

                    const blacklist = this.getBlacklistedSet();
                    if (ext && blacklist.has(ext)) return;

                    const absPath = resolveAbsolutePath(this.app, linkPath, ctx.sourcePath);
                    const iconTarget = getLocalIconTarget(linkPath, absPath);
                    if (!iconTarget) return;
                    let queryPath = '';
                    let useAttributes = false;

                    if (absPath) {
                        const resolvedExt = getExtension(absPath).toLowerCase();
                        if (resolvedExt === '.md') return;
                        if (resolvedExt && blacklist.has(resolvedExt)) return;
                        if (!resolvedExt && !this.settings.enableFolderIcons) return;
                        queryPath = absPath;
                        useAttributes = false;
                    } else {
                        queryPath = iconTarget.queryPath;
                        useAttributes = iconTarget.useAttributes;
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

                    const emSize = getIconSizeEm(this.settings, headingLevel);
                    const ownerDocument = linkEl.ownerDocument;
                    const span = ownerDocument.createDocumentFragment().createSpan();
                    span.addClass('links-with-icons-osicon');
                    span.toggleClass('links-with-icons-hide-in-pdf', this.settings.hideIconsInPdf);
                    span.style.width = emSize + 'em';
                    span.style.height = emSize + 'em';

                    const targetExt = useAttributes ? queryPath : getExtension(queryPath).toLowerCase();
                    const isFolder = !targetExt && !useAttributes;
                    const cacheKey = this.getIconCacheKey(queryPath, useAttributes);

                    if (isFolder && this.settings.folderIconStyle !== 'native') {
                        const iconId = this.settings.folderIconStyle;
                        setIcon(span, iconId);
                    } else if (this.iconCache[cacheKey]) {
                        const img = ownerDocument.createDocumentFragment().createEl('img');
                        img.src = this.iconCache[cacheKey];
                        span.appendChild(img);
                    } else if (!Platform.isWin) {
                        const iconId = getLucideIconForExtension(targetExt, isFolder);
                        setIcon(span, iconId);
                    } else {
                        setIcon(span, getLucideIconForExtension(targetExt, isFolder));
                        void this.getIconForFile(queryPath, useAttributes).then((iconData) => {
                            if (iconData && span.isConnected) {
                                const img = ownerDocument.createDocumentFragment().createEl('img');
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

    onunload(): void {
        this.isUnloading = true;
        this.cancelExtractions();
        this.editorRefreshCallbacks.clear();
        void this.flushDiskCache();
    }

    async loadSettings(): Promise<void> {
        const loaded: unknown = await this.loadData();
        this.settings = loadValidatedSettings(loaded);
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
        this.settingsRevision++;
        this.app.workspace.updateOptions();
        for (const refresh of this.editorRefreshCallbacks) refresh();
        this.refreshReadingViews();
    }

    private refreshReadingViews(): void {
        this.app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view instanceof MarkdownView && leaf.view.getMode() === 'preview') {
                leaf.view.previewMode.rerender(true);
            }
        });
    }

    // ── Disk cache helpers ────────────────────────────────────────────────

    async loadDiskCache(): Promise<void> {
        if (!this.diskCachePath || !this.settings.enableDiskCache) return;
        try {
            const adapter = this.app.vault.adapter;
            if (await adapter.exists(this.diskCachePath)) {
                const data = await adapter.read(this.diskCachePath);
                const parsed = JSON.parse(data) as DiskCachePayload | Record<string, string>;
                const icons = 'version' in parsed && 'icons' in parsed
                    ? parsed.version === LinksWithIconsPlugin.DISK_CACHE_VERSION ? parsed.icons : {}
                    : parsed;
                for (const [key, value] of Object.entries(icons)) {
                    if (typeof value === 'string' && value.startsWith('data:image/png;base64,')) {
                        this.iconCache[key] = value;
                    }
                }
            }
        } catch (error) {
            console.error('Links with Icons: failed to load disk cache', error);
        }
    }

    private scheduleDiskCacheSave(): void {
        if (!this.diskCachePath || !this.settings.enableDiskCache) return;
        this.cacheDirty = true;
        this.cacheRevision++;
        if (this.saveDiskCacheTimer !== null) window.clearTimeout(this.saveDiskCacheTimer);
        this.saveDiskCacheTimer = window.setTimeout(() => {
            this.saveDiskCacheTimer = null;
            void this.flushDiskCache();
        }, 2000);
    }

    async flushDiskCache(): Promise<void> {
        if (this.saveDiskCacheTimer !== null) {
            window.clearTimeout(this.saveDiskCacheTimer);
            this.saveDiskCacheTimer = null;
        }
        if (!this.diskCachePath || !this.settings.enableDiskCache || !this.cacheDirty) return;
        if (this.diskCacheWritePromise) {
            try {
                await this.diskCacheWritePromise;
            } catch {
                // The in-flight writer reports its own error below.
            }
        }
        if (!this.cacheDirty) return;

        const revision = this.cacheRevision;
        const adapter = this.app.vault.adapter;
        const payload: DiskCachePayload = {
            version: LinksWithIconsPlugin.DISK_CACHE_VERSION,
            icons: this.iconCache,
        };
        const writePromise = adapter.write(this.diskCachePath, JSON.stringify(payload));
        this.diskCacheWritePromise = writePromise;
        try {
            await writePromise;
            if (revision === this.cacheRevision) this.cacheDirty = false;
        } catch (error) {
            console.error('Links with Icons: failed to save disk cache', error);
        } finally {
            if (this.diskCacheWritePromise === writePromise) this.diskCacheWritePromise = null;
        }
    }

    async setDiskCacheEnabled(enabled: boolean): Promise<void> {
        if (enabled) {
            this.cacheDirty = true;
            this.cacheRevision++;
            await this.flushDiskCache();
        } else {
            await this.deleteDiskCache();
        }
    }

    async clearIconCache(): Promise<void> {
        this.cacheGeneration++;
        this.cancelExtractions();
        this.iconCache = {};
        this.failedExtractions.clear();
        this.cacheDirty = false;
        this.cacheRevision++;
        await this.deleteDiskCache();
        this.settingsRevision++;
        this.app.workspace.updateOptions();
        for (const refresh of this.editorRefreshCallbacks) refresh();
        this.refreshReadingViews();
    }

    private async deleteDiskCache(): Promise<void> {
        if (this.saveDiskCacheTimer !== null) {
            window.clearTimeout(this.saveDiskCacheTimer);
            this.saveDiskCacheTimer = null;
        }
        if (!this.diskCachePath) return;
        if (this.diskCacheWritePromise) {
            try {
                await this.diskCacheWritePromise;
            } catch {
                // The writer reports its own error; continue so cache removal can still succeed.
            }
        }
        const adapter = this.app.vault.adapter;
        if (await adapter.exists(this.diskCachePath)) {
            await adapter.remove(this.diskCachePath);
        }
    }

    getIconCacheKey(pathOrExt: string, useAttributes: boolean): string {
        return `${pathOrExt}${useAttributes ? '_attr' : '_real'}`;
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

    private runExtraction(job: ExtractionJob): Promise<string> {
        return new Promise((resolve) => {
            const escapedPath = job.pathOrExt.replace(/'/g, "''");
            const psBool = job.useAttributes ? '$true' : '$false';
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
        int imageListResult = SHGetImageList(imageListSize, ref iidImageList, ref imageList);
        if (imageListResult != 0 || imageList == IntPtr.Zero) return "";
        IntPtr hIcon = ImageList_GetIcon(imageList, shinfo.iIcon, 0);
        if (hIcon == IntPtr.Zero) return "";
        try {
            using (Bitmap bmp = Icon.FromHandle(hIcon).ToBitmap())
            using (Bitmap resized = new Bitmap(bmp, new System.Drawing.Size(64, 64)))
            using (System.IO.MemoryStream ms = new System.IO.MemoryStream()) {
                resized.Save(ms, System.Drawing.Imaging.ImageFormat.Png);
                return "data:image/png;base64," + Convert.ToBase64String(ms.ToArray());
            }
        } finally {
            DestroyIcon(hIcon);
        }
    }
}
"@ -ReferencedAssemblies System.Drawing
Write-Output ([ShellIcon]::GetBase64Icon('${escapedPath}', ${psBool}, ${imgListIdx}))
`;
            const req = (window as unknown as { require: (module: string) => unknown })['require'];
            const { Buffer: NodeBuffer } = req('buffer') as {
                Buffer: { from: (value: string, encoding: string) => { toString: (encoding: string) => string } };
            };
            const encodedCommand = NodeBuffer.from(psScript, 'utf16le').toString('base64');
            const childProcess = req('child_process') as {
                execFile: (
                    file: string,
                    args: string[],
                    options: { encoding: 'utf8'; maxBuffer: number; timeout: number; windowsHide: boolean },
                    callback: (error: Error | null, stdout: string) => void,
                ) => ChildProcessHandle;
            };
            const processHandle = childProcess.execFile(
                'powershell.exe',
                ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedCommand],
                { encoding: 'utf8', maxBuffer: 512 * 1024, timeout: 15_000, windowsHide: true },
                (error: Error | null, stdout: string) => {
                    this.activeProcesses.delete(processHandle);
                    const out = stdout.trim();
                    if (error || !out.startsWith('data:image/png;base64,')) {
                        resolve('');
                    } else {
                        resolve(out);
                    }
                },
            );
            this.activeProcesses.add(processHandle);
        });
    }

    private drainExtractionQueue(): void {
        if (this.isUnloading) return;
        while (this.extractionQueue.length > 0
            && this.activeExtractions < LinksWithIconsPlugin.MAX_CONCURRENT_EXTRACTIONS) {
            const next = this.extractionQueue.shift();
            if (next) this.startExtraction(next);
        }
    }

    private startExtraction(job: ExtractionJob): void {
        if (this.isUnloading || job.generation !== this.cacheGeneration) {
            job.resolve('');
            return;
        }

        this.activeExtractions++;
        void this.runExtraction(job)
            .then((iconData) => {
                if (job.generation !== this.cacheGeneration || this.isUnloading) return '';
                if (iconData) {
                    this.iconCache[job.cacheKey] = iconData;
                    this.scheduleDiskCacheSave();
                } else {
                    this.failedExtractions.add(job.cacheKey);
                }
                return iconData;
            })
            .catch((error: unknown) => {
                if (job.generation === this.cacheGeneration) this.failedExtractions.add(job.cacheKey);
                console.error('Links with Icons: native icon extraction failed', error);
                return '';
            })
            .then(job.resolve)
            .finally(() => {
                this.activeExtractions--;
                if (this.pendingRequests.get(job.cacheKey) === job.request) {
                    this.pendingRequests.delete(job.cacheKey);
                }
                this.drainExtractionQueue();
            });
    }

    private cancelExtractions(): void {
        const queuedJobs = this.extractionQueue;
        this.extractionQueue = [];
        for (const job of queuedJobs) job.resolve('');
        for (const processHandle of this.activeProcesses) processHandle.kill();
        this.activeProcesses.clear();
        this.pendingRequests.clear();
    }

    getIconForFile(pathOrExt: string, useAttributes: boolean): Promise<string> {
        const cacheKey = this.getIconCacheKey(pathOrExt, useAttributes);
        const cachedIcon = this.iconCache[cacheKey];
        if (cachedIcon) return Promise.resolve(cachedIcon);
        if (this.failedExtractions.has(cacheKey) || !Platform.isWin || this.isUnloading) return Promise.resolve('');
        const pendingRequest = this.pendingRequests.get(cacheKey);
        if (pendingRequest) return pendingRequest;

        let resolveRequest: (iconData: string) => void = () => undefined;
        const promise = new Promise<string>((resolve) => {
            resolveRequest = resolve;
        });
        const job: ExtractionJob = {
            cacheKey,
            pathOrExt,
            useAttributes,
            generation: this.cacheGeneration,
            resolve: resolveRequest,
            request: promise,
        };
        this.pendingRequests.set(cacheKey, promise);
        if (this.activeExtractions < LinksWithIconsPlugin.MAX_CONCURRENT_EXTRACTIONS) {
            this.startExtraction(job);
        } else {
            this.extractionQueue.push(job);
        }
        return promise;
    }
}
