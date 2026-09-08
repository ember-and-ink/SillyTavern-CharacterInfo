// card.js
// Turns a SillyTavern character-card field bundle into the ordered list of
// sections the modal renders. Pure: no DOM, no SillyTavern globals, no I/O —
// everything here is unit-tested in test/card.test.js.
//
// The input is whatever `SillyTavern.getContext().getCharacterCardFields()`
// returns. That call already does the fallbacks (data.description vs the
// top-level mirror), the {{char}}/{{user}} macro substitution, and the
// chat-metadata overrides for scenario and example dialogue — so what lands
// here is the text as this chat actually sees it, which is exactly what you
// want when you're reading the card to stay consistent with it mid-roleplay.

/**
 * The sections, in reading order. `field` names a key on the card-field bundle.
 * Order matters: creator's notes first because they're the out-of-character
 * briefing, then the in-world material, then the long reference blocks.
 * @type {{id: string, field: string, label: string, icon: string, defaultOpen: boolean}[]}
 */
export const SECTION_DEFS = [
    { id: 'creator_notes', field: 'creatorNotes', label: "Creator's Notes", icon: 'fa-feather-pointed', defaultOpen: false },
    { id: 'description', field: 'description', label: 'Description', icon: 'fa-scroll', defaultOpen: true },
    { id: 'personality', field: 'personality', label: 'Personality', icon: 'fa-masks-theater', defaultOpen: true },
    { id: 'scenario', field: 'scenario', label: 'Scenario', icon: 'fa-map-location-dot', defaultOpen: true },
    { id: 'first_mes', field: 'firstMessage', label: 'First Message', icon: 'fa-message', defaultOpen: false },
    { id: 'alt_greetings', field: 'alternateGreetings', label: 'Alternate Greetings', icon: 'fa-comments', defaultOpen: false },
    { id: 'mes_example', field: 'mesExamples', label: 'Example Dialogue', icon: 'fa-comment-dots', defaultOpen: false },
];

/** Trim to a string, tolerating undefined/null/non-strings from odd cards. */
function str(value) {
    return typeof value === 'string' ? value.trim() : '';
}

/**
 * Split an example-dialogue blob into its individual exchanges.
 *
 * Cards separate examples with a literal `<START>` marker (case-insensitive,
 * and plenty of cards omit the leading one). Splitting here means the modal can
 * put a little rule between exchanges instead of rendering one undifferentiated
 * wall of dialogue.
 *
 * @param {string} text raw mes_example content
 * @returns {string[]} one entry per exchange, empties dropped
 */
export function splitExampleBlocks(text) {
    const raw = str(text);
    if (!raw) return [];
    return raw
        .split(/<START>/gi)
        .map(block => block.trim())
        .filter(Boolean);
}

/**
 * Compact size label for a section header ("820", "1.2k", "14k").
 *
 * This is the one number worth showing on a collapsed section: it tells you
 * whether opening it costs a glance or a scroll, which is the whole point of
 * having them collapsed.
 *
 * @param {number} chars
 * @returns {string}
 */
export function formatCount(chars) {
    if (!Number.isFinite(chars) || chars <= 0) return '';
    if (chars < 1000) return String(Math.round(chars));
    if (chars < 10000) return `${(chars / 1000).toFixed(1)}k`;
    return `${Math.round(chars / 1000)}k`;
}

/**
 * Pull the blocks for one section out of the card fields.
 *
 * Most sections are a single block of text. Alternate greetings are an array
 * (one block each, numbered), and example dialogue is one string that splits
 * into several. Returning a uniform `{label, text}[]` keeps the renderer from
 * having to special-case any of them.
 *
 * @param {object} def a SECTION_DEFS entry
 * @param {object} fields card-field bundle
 * @returns {{label: string, text: string}[]}
 */
function blocksFor(def, fields) {
    const value = fields?.[def.field];

    if (def.id === 'alt_greetings') {
        // Numbered by array position, not by position among the non-empty ones,
        // so "Greeting 3" here is the greeting the character editor also calls
        // #3 even when an earlier slot was left blank.
        const list = Array.isArray(value) ? value : [];
        return list
            .map((text, i) => ({ label: `Greeting ${i + 1}`, text: str(text) }))
            .filter(b => b.text);
    }

    if (def.id === 'mes_example') {
        const blocks = splitExampleBlocks(value);
        // A single unmarked example needs no "Example 1" heading above it.
        if (blocks.length <= 1) return blocks.map(text => ({ label: '', text }));
        return blocks.map((text, i) => ({ label: `Example ${i + 1}`, text }));
    }

    const text = str(value);
    return text ? [{ label: '', text }] : [];
}

/**
 * Build the renderable section list for a character.
 *
 * Sections with nothing in them are dropped rather than shown empty — a card
 * with no scenario should not cost you a line of screen space saying so.
 *
 * @param {object} fields card-field bundle from getCharacterCardFields()
 * @returns {{id: string, label: string, icon: string, defaultOpen: boolean, blocks: {label: string, text: string}[], chars: number, count: string}[]}
 */
export function buildSections(fields) {
    const sections = [];
    for (const def of SECTION_DEFS) {
        const blocks = blocksFor(def, fields);
        if (blocks.length === 0) continue;
        const chars = blocks.reduce((sum, b) => sum + b.text.length, 0);
        sections.push({
            id: def.id,
            label: def.label,
            icon: def.icon,
            defaultOpen: def.defaultOpen,
            blocks,
            chars,
            count: formatCount(chars),
        });
    }
    return sections;
}

/**
 * The one-line subtitle under the character name: version, creator, tags.
 * Any of the three may be missing; the separator only appears between parts
 * that actually exist.
 *
 * @param {{version?: string, creator?: string, tags?: string[]}} meta
 * @returns {string}
 */
export function buildSubtitle({ version, creator, tags } = {}) {
    const parts = [];
    const v = str(version);
    const c = str(creator);
    const t = Array.isArray(tags) ? tags.map(str).filter(Boolean) : [];
    // Cards are supposed to put a version string here, but plenty put a source
    // URL or a sentence. Only prefix "v" when it actually looks like a version,
    // so a card doesn't end up announcing itself as "vhttps://...".
    if (v) parts.push(/^v?\d/i.test(v) ? `v${v.replace(/^v/i, '')}` : v);
    if (c) parts.push(`by ${c}`);
    if (t.length) parts.push(t.join(', '));
    return parts.join(' • ');
}
