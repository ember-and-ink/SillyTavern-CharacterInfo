// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderBlock, paint, escapeHtml, markQuotes } from '../render.js';

// render.js caches its showdown converter across calls, so these tests install
// the stubs the same way SillyTavern installs the real libraries: as globals,
// before the module is first asked to render.
beforeEach(async () => {
    globalThis.showdown = {
        Converter: class {
            makeHtml(text) { return text; }
        },
    };
    const { default: DOMPurify } = await import('dompurify');
    globalThis.DOMPurify = DOMPurify;
});

afterEach(() => {
    delete globalThis.showdown;
    delete globalThis.DOMPurify;
});

describe('escapeHtml', () => {
    it('escapes the characters that could break out of text', () => {
        expect(escapeHtml(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
    });
});

describe('markQuotes', () => {
    it('wraps straight-quoted speech, keeping the quote characters', () => {
        expect(markQuotes('She said "hello" softly.')).toBe('She said <q>"hello"</q> softly.');
    });

    it('handles the other quote styles SillyTavern recognises', () => {
        expect(markQuotes('\u201Ccurly\u201D')).toBe('<q>\u201Ccurly\u201D</q>');
        expect(markQuotes('\u00ABguillemets\u00BB')).toBe('<q>\u00ABguillemets\u00BB</q>');
        expect(markQuotes('\u300Ccorner\u300D')).toBe('<q>\u300Ccorner\u300D</q>');
    });

    it('leaves quotes inside code alone', () => {
        expect(markQuotes('`const a = "x";`')).toBe('`const a = "x";`');
        expect(markQuotes('```\nsay "hi"\n```')).toBe('```\nsay "hi"\n```');
    });

    it('does not mistake HTML attribute quotes for speech', () => {
        expect(markQuotes('<div style="color: red">box</div>')).toBe('<div style="color: red">box</div>');
    });

    it('marks real speech alongside attributes and code in the same text', () => {
        expect(markQuotes('<b class="x">A</b> `"y"` and "z".'))
            .toBe('<b class="x">A</b> `"y"` and <q>"z"</q>.');
    });

    it('leaves text with no dialogue untouched', () => {
        expect(markQuotes('Just narration.')).toBe('Just narration.');
    });
});

describe('renderBlock', () => {
    it('returns nothing for empty or non-string input', () => {
        expect(renderBlock('')).toBe('');
        expect(renderBlock(undefined)).toBe('');
        expect(renderBlock(null)).toBe('');
        expect(renderBlock(42)).toBe('');
    });

    it('strips scripts and event handlers from card text', () => {
        const html = renderBlock('<script>alert(1)</script><img src=x onerror="alert(1)">');
        expect(html).not.toContain('script');
        expect(html).not.toContain('onerror');
    });

    it('drops <style> blocks so a card cannot restyle SillyTavern', () => {
        const html = renderBlock('<style>body { display: none; }</style><p>Notes</p>');
        expect(html).not.toContain('<style');
        expect(html).not.toContain('display: none');
        expect(html).toContain('Notes');
    });

    it('keeps inline style attributes, which is how most notes are formatted', () => {
        expect(renderBlock('<div style="color: red">Warning</div>')).toContain('style="color: red"');
    });

    it('emits <q> for dialogue so the stylesheet can colour it', () => {
        const html = renderBlock('He shrugged. "Fine," she said.');
        expect(html).toContain('<q>"Fine,"</q>');
    });

    it('keeps ordinary formatting markup intact', () => {
        const html = renderBlock('<p><strong>Bold</strong> and <em>italic</em></p>');
        expect(html).toContain('<strong>Bold</strong>');
        expect(html).toContain('<em>italic</em>');
    });
});

describe('renderBlock without SillyTavern libraries', () => {
    it('falls back to escaped plain text with line breaks', () => {
        delete globalThis.DOMPurify;
        const html = renderBlock('a < b\nsecond line');
        expect(html).toBe('a &lt; b<br>second line');
    });
});

describe('paint', () => {
    it('fills the element with rendered content', () => {
        const el = document.createElement('div');
        paint(el, '<p>Hello</p>');
        expect(el.textContent).toBe('Hello');
    });

    it('makes links open externally without an opener handle', () => {
        const el = document.createElement('div');
        paint(el, '<a href="https://example.com">link</a>');
        const a = el.querySelector('a');
        expect(a.getAttribute('target')).toBe('_blank');
        expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    });
});
