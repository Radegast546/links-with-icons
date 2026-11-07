import { afterEach, describe, expect, it, vi } from 'vitest';
import { Platform, type App, type PluginManifest } from 'obsidian';
import LinksWithIconsPlugin from '../main';
import type { MarkdownPostProcessor, MarkdownPostProcessorContext } from 'obsidian';

function harness() {
    const calls: { finish: (error: Error | null, stdout: string) => void; kill: ReturnType<typeof vi.fn> }[] = [];
    const execFile = vi.fn((_file: string, _args: string[], _options: unknown, finish: (error: Error | null, stdout: string) => void) => {
        const kill = vi.fn(() => { finish(new Error('Cancelled'), ''); return true; });
        calls.push({ finish, kill });
        return { kill };
    });
    vi.stubGlobal('window', { require: () => ({ execFile }), setTimeout, clearTimeout });
    const app = {
        workspace: { updateOptions: vi.fn(), iterateAllLeaves: vi.fn() },
        vault: { adapter: { exists: vi.fn(async () => false) } },
    };
    const plugin = new LinksWithIconsPlugin(app as unknown as App, {} as PluginManifest);
    plugin.settings = {
        iconSize: 16, enableInternalLinks: true, enableExternalLinks: true, enableFolderIcons: true,
        folderIconStyle: 'native', blacklistedExtensions: '', enableDiskCache: false,
        enableDynamicSizing: true, enableWebFavicons: true, faviconProvider: 'google',
        webFallbackIcon: 'globe', ignoredDomains: '', hideIconsInPdf: false,
    };
    return { plugin, calls, execFile };
}

afterEach(() => { Platform.isWin = true; vi.unstubAllGlobals(); });

describe('native extraction lifecycle', () => {
    it('actively refreshes idle editors after changing display settings', async () => {
        const { plugin } = harness();
        const refresh = vi.fn();
        plugin.editorRefreshCallbacks.add(refresh);
        await plugin.saveSettings();
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(plugin.settingsRevision).toBe(1);
    });
    it('deduplicates concurrent requests and caches failures for the session', async () => {
        const { plugin, calls, execFile } = harness();
        const request = plugin.getIconForFile('.pdf', true);
        expect(plugin.getIconForFile('.pdf', true)).toBe(request);
        calls[0]?.finish(new Error('Unavailable'), '');
        expect(await request).toBe('');
        expect(await plugin.getIconForFile('.pdf', true)).toBe('');
        expect(execFile).toHaveBeenCalledTimes(1);
    });

    it('cancels queued jobs on unload and does not cache late results', async () => {
        const { plugin, calls, execFile } = harness();
        const requests = Array.from({ length: 8 }, (_, index) => plugin.getIconForFile(`.${index}`, true));
        expect(execFile).toHaveBeenCalledTimes(5);
        plugin.onunload();
        expect(await Promise.all(requests)).toEqual(Array<string>(8).fill(''));
        expect(execFile).toHaveBeenCalledTimes(5);
        expect(calls.every((call) => call.kill.mock.calls.length === 1)).toBe(true);
        expect(plugin.iconCache).toEqual({});
    });

    it('discards extraction output that completes after clearing the cache', async () => {
        const { plugin, calls } = harness();
        const request = plugin.getIconForFile('.pdf', true);
        calls[0]?.kill.mockImplementation(() => true);
        await plugin.clearIconCache();
        calls[0]?.finish(null, 'data:image/png;base64,old');
        expect(await request).toBe('');
        expect(plugin.iconCache).toEqual({});
    });

    it('never loads child_process on non-Windows platforms', async () => {
        const { plugin, execFile } = harness();
        Platform.isWin = false;
        expect(await plugin.getIconForFile('.pdf', true)).toBe('');
        expect(execFile).not.toHaveBeenCalled();
    });
});

describe('Reading View integration', () => {
    it('keeps resolved attachment icons on mobile, skips missing notes, and uses the rendering source', async () => {
        const { plugin } = harness();
        Platform.isWin = false;
        const resolve = vi.fn((target: string) => target === 'report.pdf' ? { path: 'attachments/report.pdf' } : null);
        Object.assign(plugin.app, { metadataCache: { getFirstLinkpathDest: resolve } });
        await plugin.onload();
        const callback = (plugin as unknown as { postProcessor: MarkdownPostProcessor }).postProcessor;
        const created: unknown[] = [];
        const ownerDocument = {
            createElement: () => ({ addClass: vi.fn(), toggleClass: vi.fn(), style: {}, appendChild: vi.fn() }),
        };
        const makeLink = (target: string) => ({
            querySelector: () => null,
            getAttribute: (attribute: string) => attribute === 'data-href' ? target : null,
            hasClass: (name: string) => name === 'internal-link',
            ownerDocument, parentElement: null,
            prepend: (icon: unknown) => created.push(icon),
        });
        const el = { querySelectorAll: () => [makeLink('report.pdf'), makeLink('Robinson Crusoe (Josef V. Pleva)')] };
        await callback(el as unknown as HTMLElement, { sourcePath: 'notes/project.md' } as MarkdownPostProcessorContext);
        expect(created).toHaveLength(1);
        expect(resolve).toHaveBeenCalledWith('report.pdf', 'notes/project.md');
        plugin.onunload();
    });
});
