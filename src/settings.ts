export interface LinksWithIconsSettings {
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
    hideIconsInPdf: boolean;
}

export const DEFAULT_SETTINGS: LinksWithIconsSettings = {
    iconSize: 16, enableInternalLinks: true, enableExternalLinks: true, enableFolderIcons: true,
    folderIconStyle: 'native', blacklistedExtensions: '', enableDiskCache: true,
    enableDynamicSizing: true, enableWebFavicons: true, faviconProvider: 'google',
    webFallbackIcon: 'globe', ignoredDomains: '', hideIconsInPdf: false,
};

/** Sync conflicts and hand-edited data must not break every editor on startup. */
export function loadValidatedSettings(raw: unknown): LinksWithIconsSettings {
    const result = { ...DEFAULT_SETTINGS };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
    const source = raw as Record<string, unknown>;
    for (const key of ['enableInternalLinks', 'enableExternalLinks', 'enableFolderIcons', 'enableDiskCache',
        'enableDynamicSizing', 'enableWebFavicons', 'hideIconsInPdf'] as const) {
        if (typeof source[key] === 'boolean') result[key] = source[key];
    }
    for (const key of ['blacklistedExtensions', 'ignoredDomains'] as const) {
        if (typeof source[key] === 'string') result[key] = source[key];
    }
    if (typeof source.iconSize === 'number' && Number.isFinite(source.iconSize)) {
        result.iconSize = Math.max(8, Math.min(64, source.iconSize));
    }
    for (const [key, choices] of [
        ['faviconProvider', ['google', 'duckduckgo', 'iconhorse', 'direct']],
        ['folderIconStyle', ['native', 'folder', 'folder-open', 'folder-closed', 'folder-archive', 'book']],
        ['webFallbackIcon', ['globe', 'link', 'external-link', 'compass', 'globe-2']],
    ] as const) {
        const value = source[key];
        if (typeof value === 'string' && (choices as readonly string[]).includes(value)) result[key] = value;
    }
    return result;
}
