import { describe, it, expect } from 'vitest';
import { buildSections, buildSubtitle, splitExampleBlocks, formatCount, SECTION_DEFS } from '../card.js';

/** A card-field bundle shaped like getCharacterCardFields() returns. */
function fields(overrides = {}) {
    return {
        creatorNotes: '',
        description: '',
        personality: '',
        scenario: '',
        firstMessage: '',
        alternateGreetings: [],
        mesExamples: '',
        version: '',
        ...overrides,
    };
}

describe('splitExampleBlocks', () => {
    it('splits on <START> markers and trims', () => {
        const text = '<START>\n{{user}}: Hi\n{{char}}: Hello\n<START>\n{{user}}: Bye';
        expect(splitExampleBlocks(text)).toEqual([
            '{{user}}: Hi\n{{char}}: Hello',
            '{{user}}: Bye',
        ]);
    });

    it('handles a leading marker being omitted', () => {
        expect(splitExampleBlocks('{{user}}: Hi')).toEqual(['{{user}}: Hi']);
    });

    it('is case-insensitive about the marker', () => {
        expect(splitExampleBlocks('<start>\nA\n<START>\nB')).toEqual(['A', 'B']);
    });

    it('drops empty blocks and non-strings', () => {
        expect(splitExampleBlocks('<START>\n\n<START>\nA')).toEqual(['A']);
        expect(splitExampleBlocks('')).toEqual([]);
        expect(splitExampleBlocks(undefined)).toEqual([]);
        expect(splitExampleBlocks(null)).toEqual([]);
    });
});

describe('formatCount', () => {
    it('shows small counts exactly', () => {
        expect(formatCount(820)).toBe('820');
        expect(formatCount(999)).toBe('999');
    });

    it('abbreviates thousands with one decimal, then rounds', () => {
        expect(formatCount(1200)).toBe('1.2k');
        expect(formatCount(9999)).toBe('10.0k');
        expect(formatCount(14200)).toBe('14k');
    });

    it('renders nothing for empty or invalid sizes', () => {
        expect(formatCount(0)).toBe('');
        expect(formatCount(-5)).toBe('');
        expect(formatCount(NaN)).toBe('');
    });
});

describe('buildSections', () => {
    it('omits sections the card leaves empty', () => {
        const sections = buildSections(fields({ description: 'A knight.' }));
        expect(sections.map(s => s.id)).toEqual(['description']);
    });

    it('drops whitespace-only fields', () => {
        expect(buildSections(fields({ scenario: '   \n  ' }))).toEqual([]);
    });

    it('tolerates a missing or malformed bundle', () => {
        expect(buildSections(undefined)).toEqual([]);
        expect(buildSections({})).toEqual([]);
        expect(buildSections(fields({ description: 42 }))).toEqual([]);
    });

    it('keeps SECTION_DEFS reading order regardless of field order', () => {
        const sections = buildSections(fields({
            mesExamples: 'example',
            description: 'desc',
            creatorNotes: 'notes',
            scenario: 'scen',
        }));
        expect(sections.map(s => s.id)).toEqual(['creator_notes', 'description', 'scenario', 'mes_example']);
    });

    it('numbers alternate greetings by their slot on the card, skipping blanks', () => {
        const [section] = buildSections(fields({ alternateGreetings: ['Hello there', '  ', 'Hi again'] }));
        expect(section.id).toBe('alt_greetings');
        // Numbering follows the card's own array position, so "Greeting 3" here
        // is the same greeting the character editor calls #3.
        expect(section.blocks).toEqual([
            { label: 'Greeting 1', text: 'Hello there' },
            { label: 'Greeting 3', text: 'Hi again' },
        ]);
    });

    it('ignores alternate greetings that are not an array', () => {
        expect(buildSections(fields({ alternateGreetings: 'not an array' }))).toEqual([]);
    });

    it('labels multiple examples but leaves a lone example unlabelled', () => {
        const [multi] = buildSections(fields({ mesExamples: '<START>\nA\n<START>\nB' }));
        expect(multi.blocks.map(b => b.label)).toEqual(['Example 1', 'Example 2']);

        const [single] = buildSections(fields({ mesExamples: '<START>\nA' }));
        expect(single.blocks).toEqual([{ label: '', text: 'A' }]);
    });

    it('sums block sizes into a compact count', () => {
        const [section] = buildSections(fields({ description: 'x'.repeat(1500) }));
        expect(section.chars).toBe(1500);
        expect(section.count).toBe('1.5k');
    });

    it('carries the default open state from the section definition', () => {
        const sections = buildSections(fields({ description: 'd', creatorNotes: 'n' }));
        const byId = Object.fromEntries(sections.map(s => [s.id, s.defaultOpen]));
        expect(byId.description).toBe(true);
        expect(byId.creator_notes).toBe(false);
    });

    it('gives every section definition a unique id', () => {
        const ids = SECTION_DEFS.map(d => d.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe('buildSubtitle', () => {
    it('joins the parts that exist', () => {
        expect(buildSubtitle({ version: '1.2', creator: 'Anon', tags: ['fantasy', 'knight'] }))
            .toBe('v1.2 • by Anon • fantasy, knight');
    });

    it('does not double the v prefix', () => {
        expect(buildSubtitle({ version: 'v3' })).toBe('v3');
    });

    it('leaves a version that is not a version number unprefixed', () => {
        // Real cards put source URLs and sentences in character_version.
        expect(buildSubtitle({ version: 'https://example.com/characters/abc' }))
            .toBe('https://example.com/characters/abc');
        expect(buildSubtitle({ version: 'main' })).toBe('main');
    });

    it('omits missing parts without leaving separators behind', () => {
        expect(buildSubtitle({ creator: 'Anon' })).toBe('by Anon');
        expect(buildSubtitle({ tags: ['solo'] })).toBe('solo');
        expect(buildSubtitle({})).toBe('');
        expect(buildSubtitle()).toBe('');
    });

    it('ignores blank tags and non-array tag values', () => {
        expect(buildSubtitle({ tags: ['a', '  ', 'b'] })).toBe('a, b');
        expect(buildSubtitle({ tags: 'nope' })).toBe('');
    });
});
