// modal.js
// The read-only character info modal. DOM only — it knows nothing about
// SillyTavern beyond the CSS variables the theme provides. Everything it needs
// (name, avatar, sections, persisted open state) is handed in by index.js.
//
// Two things keep this cheap on an iPad mid-generation:
//   • Section bodies are markdown-rendered the first time they're opened, not
//     on build. Opening the modal on a card with a 30k-character lorebook-sized
//     description costs you a header and seven collapsed rows.
//   • It's one overlay in the existing document. No iframe, no second tab, no
//     route change — nothing that could interrupt a streaming response.

import { paint } from './render.js';

let overlayEl = null;
let keyHandler = null;

function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

/** Close the modal if one is open. Safe to call when nothing is open. */
export function closeInfoModal() {
    if (keyHandler) {
        document.removeEventListener('keydown', keyHandler, true);
        keyHandler = null;
    }
    overlayEl?.remove();
    overlayEl = null;
}

export function isOpen() {
    return !!overlayEl;
}

/** Render a section's blocks into its body, once. */
function paintSection(details, section) {
    if (details.dataset.painted === '1') return;
    details.dataset.painted = '1';
    const body = details.querySelector('.sci-content');
    // Sections that hold several distinct pieces (each alternate greeting, each
    // example exchange) get their blocks boxed so they don't read as one run-on
    // passage. A single-block section stays flat rather than nesting a lone box.
    if (section.blocks.length > 1) body.classList.add('sci-content--split');
    for (const block of section.blocks) {
        if (block.label) {
            body.appendChild(el(`<div class="sci-block-label">${escapeHtml(block.label)}</div>`));
        }
        const div = document.createElement('div');
        div.className = 'sci-block';
        paint(div, block.text);
        body.appendChild(div);
    }
}

/**
 * Move one section to `open`, rendering it if it needs rendering and reporting
 * the change. Idempotent: calling it with the state a section is already in
 * costs nothing, which is what lets the click path and the browser's own
 * toggle event both route through here without fighting.
 */
function applyOpen(details, section, open, onToggle) {
    if (!details || !section) return;
    if (details.open !== open) details.open = open;
    if (open) paintSection(details, section);
    onToggle?.(section.id, open);
}

/**
 * Update the expand/collapse-all button to offer whichever action is useful:
 * if anything is closed, it expands; only when everything is open does it
 * become a collapse.
 */
function syncToggleAll(btn) {
    const all = [...overlayEl.querySelectorAll('.sci-section')];
    const anyClosed = all.some(d => !d.open);
    btn.dataset.mode = anyClosed ? 'expand' : 'collapse';
    btn.title = anyClosed ? 'Expand all sections' : 'Collapse all sections';
    btn.querySelector('i').className = anyClosed
        ? 'fa-solid fa-angles-down'
        : 'fa-solid fa-angles-up';
}

/**
 * Open the info modal.
 *
 * @param {object} opts
 * @param {string} opts.name character name, shown as the title
 * @param {string} [opts.avatarUrl] thumbnail URL, omitted if absent
 * @param {string} [opts.subtitle] version / creator / tags line
 * @param {object[]} opts.sections from card.js buildSections()
 * @param {Record<string, boolean>} [opts.openState] persisted per-section open flags
 * @param {(id: string, open: boolean) => void} [opts.onToggle] called when a section is opened or closed
 */
export function openInfoModal({ name, avatarUrl, subtitle, sections, openState = {}, onToggle }) {
    closeInfoModal();

    overlayEl = el(`
        <div class="sci-overlay">
            <div class="sci-modal" role="dialog" aria-modal="true" aria-label="Character info">
                <div class="sci-header">
                    ${avatarUrl ? `<img class="sci-avatar" src="${escapeHtml(avatarUrl)}" alt="">` : ''}
                    <div class="sci-title">
                        <h3>${escapeHtml(name)}</h3>
                        ${subtitle ? `<div class="sci-subtitle">${escapeHtml(subtitle)}</div>` : ''}
                    </div>
                    <div class="sci-header-actions">
                        <div class="sci-toggle-all menu_button" data-mode="expand" title="Expand all sections"><i class="fa-solid fa-angles-down"></i></div>
                        <div class="sci-close menu_button" title="Close"><i class="fa-solid fa-xmark"></i></div>
                    </div>
                </div>
                <div class="sci-body"></div>
            </div>
        </div>
    `);

    const body = overlayEl.querySelector('.sci-body');
    const sectionsById = new Map(sections.map(s => [s.id, s]));

    if (sections.length === 0) {
        body.appendChild(el('<div class="sci-empty">This card has no description, personality, scenario, or notes to show.</div>'));
    }

    for (const section of sections) {
        // A section the user has never touched falls back to its own default;
        // once they've opened or closed it, their choice wins for every card.
        const open = Object.prototype.hasOwnProperty.call(openState, section.id)
            ? !!openState[section.id]
            : section.defaultOpen;

        const details = el(`
            <details class="sci-section" data-id="${section.id}"${open ? ' open' : ''}>
                <summary>
                    <i class="fa-solid ${section.icon}"></i>
                    <span class="sci-section-label">${escapeHtml(section.label)}</span>
                    ${section.count ? `<span class="sci-count">${escapeHtml(section.count)}</span>` : ''}
                    <i class="fa-solid fa-chevron-down sci-chevron"></i>
                </summary>
                <div class="sci-content"></div>
            </details>
        `);

        if (open) paintSection(details, section);

        // Fired by the browser for a click on the summary, and again (async)
        // for the programmatic changes toggle-all makes. applyOpen is
        // idempotent, so the second delivery is a no-op.
        details.addEventListener('toggle', () => {
            applyOpen(details, section, details.open, onToggle);
            // A summary click changes what the header button should offer.
            if (overlayEl) syncToggleAll(overlayEl.querySelector('.sci-toggle-all'));
        });

        body.appendChild(details);
    }

    const toggleAllBtn = overlayEl.querySelector('.sci-toggle-all');
    toggleAllBtn.addEventListener('click', () => {
        const expand = toggleAllBtn.dataset.mode === 'expand';
        for (const details of overlayEl.querySelectorAll('.sci-section')) {
            // Don't wait on the toggle event here: browsers queue it as a task,
            // so leaning on it would leave this button's own label a frame stale.
            applyOpen(details, sectionsById.get(details.dataset.id), expand, onToggle);
        }
        syncToggleAll(toggleAllBtn);
    });
    syncToggleAll(toggleAllBtn);

    overlayEl.querySelector('.sci-close').addEventListener('click', closeInfoModal);
    overlayEl.addEventListener('click', (e) => {
        if (e.target === overlayEl) closeInfoModal();
    });

    // Capture phase so Escape closes this before SillyTavern's own handlers see
    // it — otherwise Escape here would also, say, cancel the pending generation.
    keyHandler = (e) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        e.preventDefault();
        closeInfoModal();
    };
    document.addEventListener('keydown', keyHandler, true);

    document.body.appendChild(overlayEl);
}
