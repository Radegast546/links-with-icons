import type { SyntaxNode, Tree } from '@lezer/common';

export interface TextRange {
    from: number;
    to: number;
}

export interface ParsedMarkdownLink {
    from: number;
    to: number;
    kind: 'wiki' | 'markdown';
    target: string;
}

const EXCLUDED_NODE_NAMES = new Set([
    'Image',
    'InlineCode',
    'FencedCode',
    'CodeBlock',
    'HTMLBlock',
    'Comment',
]);

function hasExcludedAncestor(node: SyntaxNode | null): boolean {
    let current = node;
    while (current) {
        if (EXCLUDED_NODE_NAMES.has(current.name)) return true;
        current = current.parent;
    }
    return false;
}

function mergeRanges(ranges: readonly TextRange[], documentLength: number): TextRange[] {
    const normalized = ranges
        .map(({ from, to }) => ({
            from: Math.max(0, Math.min(from, documentLength)),
            to: Math.max(0, Math.min(to, documentLength)),
        }))
        .filter(({ from, to }) => from < to)
        .sort((a, b) => a.from - b.from);

    const merged: TextRange[] = [];
    for (const range of normalized) {
        const previous = merged[merged.length - 1];
        if (previous && range.from <= previous.to) {
            previous.to = Math.max(previous.to, range.to);
        } else {
            merged.push({ ...range });
        }
    }
    return merged;
}

export function collectMarkdownLinks(
    documentText: string,
    tree: Tree,
    ranges: readonly TextRange[] = [{ from: 0, to: documentText.length }],
): ParsedMarkdownLink[] {
    const links: ParsedMarkdownLink[] = [];
    const seen = new Set<string>();
    const scanRanges = mergeRanges(ranges, documentText.length);
    const excludedRanges: TextRange[] = [];
    const frontmatter = /^(?:\uFEFF)?---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)(?:\r?\n|$)/.exec(documentText);
    if (frontmatter) excludedRanges.push({ from: 0, to: frontmatter[0].length });
    for (const match of documentText.matchAll(/<!--[\s\S]*?(?:-->|$)|%%[\s\S]*?(?:%%|$)/g)) {
        if (hasExcludedAncestor(tree.resolveInner(match.index, 1))) continue;
        excludedRanges.push({ from: match.index, to: match.index + match[0].length });
    }
    const isExcluded = (from: number, to: number) => excludedRanges.some((range) => from < range.to && to > range.from);

    for (const range of scanRanges) {
        tree.iterate({
            from: range.from,
            to: range.to,
            enter(nodeRef) {
                if (!['Link', 'Autolink'].includes(nodeRef.name) || hasExcludedAncestor(nodeRef.node.parent)) return;
                if (isExcluded(nodeRef.from, nodeRef.to)) return;
                const urlNode = nodeRef.node.getChild('URL');
                if (!urlNode) return;

                const key = `markdown:${nodeRef.from}:${nodeRef.to}`;
                if (seen.has(key)) return;
                seen.add(key);
                links.push({
                    from: nodeRef.from,
                    to: nodeRef.to,
                    kind: 'markdown',
                    target: documentText.slice(urlNode.from, urlNode.to),
                });
            },
        });

        const rangeText = documentText.slice(range.from, range.to);
        const wikiLinkPattern = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
        let match: RegExpExecArray | null;
        while ((match = wikiLinkPattern.exec(rangeText)) !== null) {
            const from = range.from + match.index;
            const to = from + match[0].length;
            if (isExcluded(from, to)) continue;
            let backslashes = 0;
            for (let position = from - 1; position >= 0 && documentText[position] === '\\'; position--) backslashes++;
            if (backslashes % 2 !== 0) continue;
            if (links.some((link) => link.kind === 'markdown' && from >= link.from && to <= link.to)) continue;
            if (from > 0 && documentText[from - 1] === '!') continue;
            if (hasExcludedAncestor(tree.resolveInner(Math.min(from + 1, documentText.length), 1))) continue;

            const key = `wiki:${from}:${to}`;
            if (seen.has(key)) continue;
            seen.add(key);
            links.push({
                from,
                to,
                kind: 'wiki',
                target: (match[1] ?? '').trim(),
            });
        }
    }

    return links.sort((a, b) => a.from - b.from || a.to - b.to);
}
