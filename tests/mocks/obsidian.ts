import { StateField } from '@codemirror/state';
import type { MarkdownPostProcessor } from 'obsidian';

export class Plugin {
    postProcessor?: MarkdownPostProcessor;
    constructor(public app: unknown, public manifest: unknown) {}
    async loadData(): Promise<unknown> { return null; }
    async saveData(): Promise<void> {}
    addSettingTab(): void {}
    registerEditorExtension(): void {}
    registerMarkdownPostProcessor(callback: MarkdownPostProcessor): void { this.postProcessor = callback; }
}
export class PluginSettingTab {}
export class Setting {}
export class Notice {}
export class App {}
export class MarkdownView {}
export class FileSystemAdapter {}
export const Platform = { isWin: true };
export const editorInfoField = StateField.define({ create: () => null, update: (value) => value });
export function setIcon(): void {}
export function parseLinktext(target: string): { path: string; subpath: string } {
    const index = target.indexOf('#');
    return index < 0 ? { path: target, subpath: '' } : { path: target.slice(0, index), subpath: target.slice(index) };
}
