import { describe, expect, it } from 'vitest';
import {
    fileUriToWindowsPath,
    getDomain,
    getExtension,
    getFaviconUrl,
    getLocalIconTarget,
    isAbsoluteLocalPath,
    isIgnoredDomain,
    normalizeMarkdownDestination,
    localPathToFileUri,
} from '../src/link-utils';

describe('link utilities', () => {
    it('opens native paths without losing hash, percent, or space characters', () => {
        expect(localPathToFileUri('C:\\Docs\\100% #1.pdf')).toBe('file:///C:/Docs/100%25%20%231.pdf');
        expect(localPathToFileUri('\\\\server\\share\\Report 1.pdf')).toBe('file://server/share/Report%201.pdf');
        expect(localPathToFileUri('file:///C:/already%20encoded.pdf')).toBe('file:///C:/already%20encoded.pdf');
    });

    it('unescapes Markdown destination punctuation', () => {
        expect(normalizeMarkdownDestination('report\\(final\\).pdf')).toBe('report(final).pdf');
    });
    it.each(['Harry Potter a Metody Racionality I.', 'Robinson Crusoe (Josef V. Pleva)', 'missing.pdf', 'missing.md'])('does not guess icons for unresolved vault link %s', (target) => {
        expect(getLocalIconTarget(target, null)).toBeNull();
    });

    it('keeps native icons for resolved attachments and file-type fallback for explicit external paths', () => {
        expect(getLocalIconTarget('report.pdf', 'C:/vault/report.pdf')).toEqual({ queryPath: 'C:/vault/report.pdf', useAttributes: false });
        expect(getLocalIconTarget('file:///C:/missing.pdf', null)).toEqual({ queryPath: '.pdf', useAttributes: true });
    });
    it('extracts extensions without query strings or fragments', () => {
        expect(getExtension('report.PDF?download=1')).toBe('.PDF');
        expect(getExtension('folder.with.dot/file')).toBe('');
    });

    it('normalizes angle-bracket Markdown destinations', () => {
        expect(normalizeMarkdownDestination('<folder/report 2026.pdf>')).toBe('folder/report 2026.pdf');
    });

    it('recognizes Windows and file URI paths', () => {
        expect(isAbsoluteLocalPath('C:\\Docs\\report.pdf')).toBe(true);
        expect(isAbsoluteLocalPath('\\\\server\\share\\report.pdf')).toBe(true);
        expect(isAbsoluteLocalPath('file:///C:/Docs/report.pdf')).toBe(true);
        expect(fileUriToWindowsPath('file:///C:/Moje%20pozn%C3%A1mky/report.pdf'))
            .toBe('C:/Moje poznámky/report.pdf');
    });

    it('handles domains and ignored subdomains safely', () => {
        expect(getDomain('https://docs.example.com/path')).toBe('docs.example.com');
        expect(getDomain('not a URL')).toBe('');
        expect(isIgnoredDomain('docs.example.com', 'example.com')).toBe(true);
        expect(isIgnoredDomain('notexample.com', 'example.com')).toBe(false);
    });

    it('decodes Windows file URLs with percent-encoded backslashes', () => {
        expect(fileUriToWindowsPath('file:///F:%5CUsers%5Cexample%5CBooks'))
            .toBe('F:\\Users\\example\\Books');
    });

    it('encodes provider URL parameters', () => {
        expect(getFaviconUrl('google', 'example.com', 64)).toContain('domain=example.com');
    });
});
