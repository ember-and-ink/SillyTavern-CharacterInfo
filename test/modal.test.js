// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openInfoModal, closeInfoModal, isOpen } from '../modal.js';
import { buildSections } from '../card.js';

/**
 * The modal renders through render.js, which reaches for window.showdown and
 * window.DOMPurify the way SillyTavern provides them. Stub both so these tests
 * exercise the real path rather than render.js's plain-text fallback.
 */
beforeEach(() => {
    globalThis.showdown = {
        Converter: class {
            makeHtml(text) { return `<p>${text}</p>`; }
        },
    };
    globalThis.DOMPurify = { sanitize: (html) => html };
});

afterEach(() => {
    closeInfoModal();
    delete globalThis.showdown;
    delete globalThis.DOMPurify;
});

function sections(overrides = {}) {
    return buildSections({
        description: 'A wandering knight.',
        personality: 'Stoic, dry humour.',
        creatorNotes: 'Play it straight.',
        alternateGreetings: [],
        mesExamples: '',
        firstMessage: '',
        scenario: '',
        ...overrides,
    });
}

function open(opts = {}) {
    openInfoModal({ name: 'Sir Gawain', sections: sections(), ...opts });
    return document.querySelector('.sci-overlay');
}

describe('openInfoModal', () => {
    it('renders the header and one details element per section', () => {
        const overlay = open();
        expect(overlay.querySelector('.sci-title h3').textContent).toBe('Sir Gawain');
        expect([...overlay.querySelectorAll('.sci-section')].map(d => d.dataset.id))
            .toEqual(['creator_notes', 'description', 'personality']);
    });

    it('escapes character names rather than parsing them as HTML', () => {
        const overlay = open({ name: '<img src=x onerror=alert(1)>' });
        expect(overlay.querySelector('.sci-title h3').querySelector('img')).toBeNull();
        expect(overlay.querySelector('.sci-title h3').textContent).toBe('<img src=x onerror=alert(1)>');
    });

    it('shows a placeholder when the card has nothing to display', () => {
        openInfoModal({ name: 'Blank', sections: [] });
        expect(document.querySelector('.sci-empty')).not.toBeNull();
        expect(document.querySelectorAll('.sci-section')).toHaveLength(0);
    });

    it('only renders the body of sections that start open', () => {
        const overlay = open();
        const notes = overlay.querySelector('[data-id="creator_notes"]');   // defaultOpen: false
        const desc = overlay.querySelector('[data-id="description"]');      // defaultOpen: true

        expect(notes.open).toBe(false);
        expect(notes.querySelector('.sci-content').children).toHaveLength(0);
        expect(desc.querySelector('.sci-content').textContent).toContain('A wandering knight.');
    });

    it('renders a section body the first time it is opened, and only once', () => {
        const overlay = open();
        const notes = overlay.querySelector('[data-id="creator_notes"]');

        notes.open = true;
        notes.dispatchEvent(new Event('toggle'));
        expect(notes.querySelector('.sci-content').textContent).toContain('Play it straight.');
        const painted = notes.querySelector('.sci-content').innerHTML;

        notes.open = false;
        notes.dispatchEvent(new Event('toggle'));
        notes.open = true;
        notes.dispatchEvent(new Event('toggle'));
        expect(notes.querySelector('.sci-content').innerHTML).toBe(painted);
    });

    it('honours persisted open state over the section defaults', () => {
        const overlay = open({ openState: { creator_notes: true, description: false } });
        expect(overlay.querySelector('[data-id="creator_notes"]').open).toBe(true);
        expect(overlay.querySelector('[data-id="description"]').open).toBe(false);
        // A section with no persisted entry keeps its own default.
        expect(overlay.querySelector('[data-id="personality"]').open).toBe(true);
    });

    it('reports every open and close through onToggle', () => {
        const onToggle = vi.fn();
        const overlay = open({ onToggle });
        const desc = overlay.querySelector('[data-id="description"]');

        desc.open = false;
        desc.dispatchEvent(new Event('toggle'));
        expect(onToggle).toHaveBeenCalledWith('description', false);

        desc.open = true;
        desc.dispatchEvent(new Event('toggle'));
        expect(onToggle).toHaveBeenCalledWith('description', true);
    });

    it('expands everything on the first toggle-all, then offers to collapse', () => {
        const overlay = open();
        const btn = overlay.querySelector('.sci-toggle-all');
        expect(btn.dataset.mode).toBe('expand');

        btn.click();
        expect([...overlay.querySelectorAll('.sci-section')].every(d => d.open)).toBe(true);
        expect(btn.dataset.mode).toBe('collapse');

        btn.click();
        expect([...overlay.querySelectorAll('.sci-section')].every(d => !d.open)).toBe(true);
        expect(btn.dataset.mode).toBe('expand');
    });

    it('re-labels the header button when a summary is clicked directly', () => {
        const overlay = open({ openState: { creator_notes: true, description: true, personality: true } });
        const btn = overlay.querySelector('.sci-toggle-all');
        expect(btn.dataset.mode).toBe('collapse');

        const desc = overlay.querySelector('[data-id="description"]');
        desc.open = false;
        desc.dispatchEvent(new Event('toggle'));
        expect(btn.dataset.mode).toBe('expand');
    });

    it('persists and renders every section that toggle-all expands', () => {
        const onToggle = vi.fn();
        const overlay = open({ onToggle });
        overlay.querySelector('.sci-toggle-all').click();

        expect(onToggle).toHaveBeenCalledWith('creator_notes', true);
        expect(onToggle).toHaveBeenCalledWith('description', true);
        expect(onToggle).toHaveBeenCalledWith('personality', true);
        for (const details of overlay.querySelectorAll('.sci-section')) {
            expect(details.querySelector('.sci-content').children.length).toBeGreaterThan(0);
        }
    });

    it('replaces an already-open modal rather than stacking a second one', () => {
        open();
        open({ name: 'Someone Else' });
        expect(document.querySelectorAll('.sci-overlay')).toHaveLength(1);
        expect(document.querySelector('.sci-title h3').textContent).toBe('Someone Else');
    });
});

describe('closing', () => {
    it('closes on the X button', () => {
        const overlay = open();
        overlay.querySelector('.sci-close').click();
        expect(isOpen()).toBe(false);
        expect(document.querySelector('.sci-overlay')).toBeNull();
    });

    it('closes on a click outside the modal but not inside it', () => {
        const overlay = open();
        overlay.querySelector('.sci-modal').click();
        expect(isOpen()).toBe(true);

        overlay.click();
        expect(isOpen()).toBe(false);
    });

    it('closes on Escape and stops the key reaching SillyTavern', () => {
        const seenByHost = vi.fn();
        document.addEventListener('keydown', seenByHost);
        open();

        document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        expect(isOpen()).toBe(false);
        expect(seenByHost).not.toHaveBeenCalled();

        document.removeEventListener('keydown', seenByHost);
    });

    it('leaves other keys alone', () => {
        open();
        document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'a', bubbles: true }));
        expect(isOpen()).toBe(true);
    });

    it('stops listening for Escape once closed', () => {
        open();
        closeInfoModal();
        // Would throw or reopen state if the handler were still attached.
        document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(isOpen()).toBe(false);
    });

    it('is safe to close when nothing is open', () => {
        expect(() => closeInfoModal()).not.toThrow();
    });
});
