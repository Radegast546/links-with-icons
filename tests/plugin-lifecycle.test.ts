import { afterEach, describe, expect, it, vi } from 'vitest';
import { Platform, type App, type PluginManifest } from 'obsidian';
import type { PluginSettingTab, Setting } from 'obsidian';
import LinksWithIconsPlugin from '../main';
import type { MarkdownPostProcessor, MarkdownPostProcessorContext } from 'obsidian';
import { Buffer } from 'node:buffer';
import { EditorState, EditorSelection } from '@codemirror/state';
import { ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view';

function harness() {
    const calls: { finish: (error: Error | null, stdout: string) => void; kill: ReturnType<typeof vi.fn> }[] = [];
    const execFile = vi.fn((_file: string, _args: string[], _options: unknown, finish: (error: Error | null, stdout: string) => void) => {
        const kill = vi.fn(() => { finish(new Error('Cancelled'), ''); return true; });
        calls.push({ finish, kill });
        return { kill };
    });
    vi.stubGlobal('window', { require: (module: string) => module === 'buffer' ? { Buffer } : { execFile }, setTimeout, clearTimeout });
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

afterEach(() => { Platform.isWin = true; vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Live Preview cursor lifecycle', () => {
    it('keeps inline icons at the end of the line and restores them after leaving link syntax or editor focus', async () => {
        const { plugin } = harness();
        const define = vi.spyOn(ViewPlugin, 'define');
        await plugin.onload();
        const create = define.mock.calls[0]?.[0];
        if (!create) throw new Error('Editor plugin was not registered');
        const markdown = 'you can click on the link [Link 2](https://example.com) or its icon\n\nOther line';
        let state = EditorState.create({ doc: markdown, selection: { anchor: markdown.length } });
        const view = { state, visibleRanges: [{ from: 0, to: markdown.length }], hasFocus: true, dispatch: vi.fn() };
        const value = create(view as unknown as EditorView, undefined) as { decorations: DecorationSet; update: (update: ViewUpdate) => void; destroy: () => void };
        const move = (position: number, focused = true) => {
            const previous = state;
            const focusChanged = view.hasFocus !== focused;
            state = state.update({ selection: EditorSelection.cursor(position) }).state;
            view.state = state;
            view.hasFocus = focused;
            value.update({ view, state, startState: previous, docChanged: false, viewportChanged: false,
                selectionSet: true, focusChanged } as unknown as ViewUpdate);
        };
        expect(value.decorations.size).toBe(1);
        move(markdown.indexOf('\n'));
        expect(value.decorations.size).toBe(1);
        move(markdown.indexOf('Link 2'));
        expect(value.decorations.size).toBe(0);
        move(0);
        expect(value.decorations.size).toBe(1);
        move(markdown.indexOf('Link 2'));
        expect(value.decorations.size).toBe(0);
        view.hasFocus = false;
        value.update({ view, state, startState: state, docChanged: false, viewportChanged: false,
            selectionSet: false, focusChanged: true } as unknown as ViewUpdate);
        expect(value.decorations.size).toBe(1);
        move(markdown.length);
        expect(value.decorations.size).toBe(1);
        value.destroy();
        expect(plugin.editorRefreshCallbacks.size).toBe(0);
        plugin.onunload();
    });
});

describe('native extraction lifecycle', () => {
    it('exposes searchable settings and preserves the PDF toggle behavior', async () => {
        const { plugin } = harness();
        await plugin.onload();
        const tab = (plugin as unknown as { settingTab: PluginSettingTab }).settingTab;
        const definitions = tab.getSettingDefinitions();
        expect(definitions.filter((definition) => 'searchable' in definition && definition.searchable).length).toBe(14);
        const definition = definitions.find((item) => 'name' in item && item.name === 'Export icons to PDF');
        let change: ((value: boolean) => Promise<void>) | undefined;
        const toggle = {
            setValue(value: boolean) { expect(value).toBe(true); return this; },
            onChange(callback: (value: boolean) => Promise<void>) { change = callback; return this; },
        };
        const setting = { addToggle: (configure: (value: typeof toggle) => void) => configure(toggle) };
        if (!definition || !('render' in definition) || !definition.render) throw new Error('Missing PDF setting');
        definition.render(setting as unknown as Setting, {} as never);
        expect(change).toBeDefined();
        await change?.(false);
        expect(plugin.settings.hideIconsInPdf).toBe(true);
        plugin.onunload();
    });
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
        const makeElement = () => ({ addClass: vi.fn(), toggleClass: vi.fn(), style: {}, appendChild: vi.fn() });
        const ownerDocument = { createDocumentFragment: () => ({ createSpan: makeElement, createEl: makeElement }) };
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
