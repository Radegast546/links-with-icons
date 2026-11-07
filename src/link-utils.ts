export function getExtension(filePath: string): string {
    const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
    const lastDot = filePath.lastIndexOf('.');
    if (lastDot === -1 || lastSlash > lastDot) return '';

    const suffix = filePath.slice(lastDot);
    const suffixEnd = suffix.search(/[?#]/);
    return suffixEnd === -1 ? suffix : suffix.slice(0, suffixEnd);
}

export function getDomain(url: string): string {
    try {
        return new URL(url).hostname;
    } catch {
        return '';
    }
}

export function isHttpUrl(target: string): boolean {
    try {
        const protocol = new URL(target).protocol;
        return protocol === 'http:' || protocol === 'https:';
    } catch {
        return false;
    }
}

export function isIgnoredDomain(domain: string, ignoredStr: string): boolean {
    if (!ignoredStr) return false;

    const ignoredList = ignoredStr
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
    const lowerDomain = domain.toLowerCase();
    return ignoredList.some((ignored) => lowerDomain === ignored || lowerDomain.endsWith(`.${ignored}`));
}

export function getFaviconUrl(provider: string, domain: string, size: number): string {
    const encodedDomain = encodeURIComponent(domain);
    switch (provider) {
        case 'google':
            return `https://www.google.com/s2/favicons?domain=${encodedDomain}&sz=${size}&default_icon=404`;
        case 'duckduckgo':
            return `https://icons.duckduckgo.com/ip3/${encodedDomain}.ico`;
        case 'iconhorse':
            return `https://icon.horse/icon/${encodedDomain}?size=${size}`;
        case 'direct':
            return `https://${domain}/favicon.ico`;
        default:
            return `https://www.google.com/s2/favicons?domain=${encodedDomain}&sz=${size}&default_icon=404`;
    }
}

export function normalizeMarkdownDestination(destination: string): string {
    const trimmed = destination.trim();
    if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
        return trimmed.slice(1, -1).replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g, '$1');
    }
    return trimmed.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g, '$1');
}

/** Preserve URL-significant characters when opening a native filesystem path. */
export function localPathToFileUri(target: string): string {
    if (/^file:\/\//i.test(target)) return target;
    const normalized = target.replace(/\\/g, '/');
    const encoded = normalized.split('/').map((segment, index) =>
        index === 0 && /^[a-z]:$/i.test(segment) ? segment : encodeURIComponent(segment),
    ).join('/');
    return normalized.startsWith('//') ? `file:${encoded}` : `file:///${encoded}`;
}

export function isAbsoluteLocalPath(target: string): boolean {
    return /^[a-zA-Z]:[\\/]/.test(target) || /^\\\\[^\\]/.test(target) || target.startsWith('file://');
}

/** Only explicit external paths may use a guessed file-type icon. Vault links must resolve. */
export function getLocalIconTarget(target: string, resolvedPath: string | null): { queryPath: string; useAttributes: boolean } | null {
    if (resolvedPath) return { queryPath: resolvedPath, useAttributes: false };
    if (!isAbsoluteLocalPath(target)) return null;
    const extension = getExtension(target).toLowerCase();
    return /^\.[a-z0-9]+$/i.test(extension) ? { queryPath: extension, useAttributes: true } : null;
}

export function fileUriToWindowsPath(target: string): string | null {
    if (!target.startsWith('file://')) return null;

    try {
        const url = new URL(target);
        const decodedPath = decodeURIComponent(url.pathname);
        if (url.hostname) {
            return `\\\\${url.hostname}${decodedPath.replace(/\//g, '\\')}`;
        }
        return decodedPath.replace(/^\/([a-zA-Z]:[\\/])/, '$1');
    } catch {
        return null;
    }
}

export function getLucideIconForExtension(ext: string, isFolder: boolean): string {
    if (isFolder) return 'folder';
    switch (ext) {
        case '.md': return 'file-edit';
        case '.txt':
        case '.pdf':
        case '.doc':
        case '.docx': return 'file-text';
        case '.xls':
        case '.xlsx':
        case '.csv': return 'sheet';
        case '.ppt':
        case '.pptx': return 'presentation';
        case '.mp3':
        case '.wav':
        case '.m4a':
        case '.ogg': return 'music';
        case '.mp4':
        case '.mkv':
        case '.avi':
        case '.mov': return 'video';
        case '.png':
        case '.jpg':
        case '.jpeg':
        case '.gif':
        case '.svg':
        case '.webp': return 'image';
        case '.zip':
        case '.rar':
        case '.7z':
        case '.tar':
        case '.gz': return 'archive';
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
