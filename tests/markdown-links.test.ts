import { parser } from '@lezer/markdown';
import { describe, expect, it } from 'vitest';
import { collectMarkdownLinks } from '../src/markdown-links';

function parseLinks(markdown: string) {
    return collectMarkdownLinks(markdown, parser.parse(markdown));
}

describe('collectMarkdownLinks', () => {
    it('does not let comment markers inside code hide subsequent links', () => {
        expect(parseLinks('`%%` [visible](https://example.com)').map((link) => link.target))
            .toEqual(['https://example.com']);
    });
    it('recognizes angle-bracket web autolinks', () => {
        expect(parseLinks('<https://example.com>').map((link) => link.target)).toEqual(['https://example.com']);
    });
    it('ignores frontmatter, hidden comments, and escaped wiki syntax', () => {
        const markdown = '---\nurl: "[site](https://example.com)"\nnote: "[[hidden.pdf]]"\n---\n'
            + '<!-- [[comment.pdf]] -->\n%% [hidden](https://example.com) %%\n\\[[escaped.pdf]]\n[[visible.pdf]]';
        expect(parseLinks(markdown).map((link) => link.target)).toEqual(['visible.pdf']);
    });

    it('recognizes external folders using encoded Windows file URLs', () => {
        const target = 'file:///F:%5CUsers%5Cexample%5CBooks';
        expect(parseLinks(`[Books](${target})`)).toEqual([
            expect.objectContaining({ kind: 'markdown', target }),
        ]);
    });
    it('extracts the destination without a Markdown title', () => {
        expect(parseLinks('[site](https://example.com "Example")')).toEqual([
            expect.objectContaining({ kind: 'markdown', target: 'https://example.com' }),
        ]);
    });

    it('supports nested parentheses in destinations', () => {
        expect(parseLinks('[file](folder(one)/report.pdf)')[0]?.target).toBe('folder(one)/report.pdf');
    });

    it('extracts wiki-link targets without aliases', () => {
        expect(parseLinks('[[reports/file.pdf|Quarterly report]]')).toEqual([
            expect.objectContaining({ kind: 'wiki', target: 'reports/file.pdf' }),
        ]);
    });

    it('does not decorate Markdown or wiki embeds', () => {
        expect(parseLinks('![image](image.png)\n![[document.pdf]]')).toEqual([]);
    });

    it('does not decorate link syntax in code', () => {
        const markdown = '`[inline](inline.pdf)`\n\n```md\n[[fenced.pdf]]\n```';
        expect(parseLinks(markdown)).toEqual([]);
    });

    it('limits collection to requested ranges', () => {
        const markdown = '[one](one.pdf) and [two](two.pdf)';
        const links = collectMarkdownLinks(markdown, parser.parse(markdown), [{ from: 0, to: 14 }]);
        expect(links.map((link) => link.target)).toEqual(['one.pdf']);
    });
});
