// render.js
// Markdown -> sanitized HTML for the card sections.
//
// SillyTavern already ships showdown and DOMPurify as window globals (see
// public/lib.js initLibraryShims), so this costs no extra download. We do NOT
// reuse the chat renderer (`context.messageFormatting`): that one runs the
// user's regex scripts at AI_OUTPUT placement and wraps quoted spans in <q>,
// both of which are right for chat messages and wrong for reading a card —
// a regex script meant to strip narration from replies would silently chew
// holes in the description you came here to read.
//
// Style handling: <style> blocks are dropped. Plenty of creator's notes ship
// a whole themed layout in one, and letting that loose would restyle
// SillyTavern itself; inline `style` attributes survive, which keeps the
// common "colored box" notes looking roughly as intended.

let converter = null;

/** Lazily build a showdown converter matching SillyTavern's own options. */
function getConverter() {
    if (converter) return converter;
    const showdown = globalThis.showdown;
    if (!showdown?.Converter) return null;
    converter = new showdown.Converter({
        emoji: true,
        literalMidWordUnderscores: true,
        parseImgDimensions: true,
        tables: true,
        underline: true,
        simpleLineBreaks: true,
        strikethrough: true,
        disableForced4SpacesIndentedSublists: true,
    });
    return converter;
}

/**
 * Spans of quoted speech, in the six quote styles SillyTavern recognises. The
 * leading alternatives (style blocks, fenced and inline code) match first and
 * are handed back untouched, which is what keeps a quote inside a code sample
 * from being treated as dialogue.
 */
const QUOTES = /<style>[\s\S]*?<\/style>|```[\s\S]*?```|~~~[\s\S]*?~~~|``[\s\S]*?``|`[\s\S]*?`|(".*?")|(\u201C.*?\u201D)|(\u00AB.*?\u00BB)|(\u300C.*?\u300D)|(\u300E.*?\u300F)|(\uFF02.*?\uFF02)/gim;

/**
 * Wrap quoted speech in <q> so the stylesheet can colour it the way the chat
 * colours dialogue.
 *
 * Card descriptions are mostly narration with speech mixed in, and a wall of
 * one colour is exactly what makes them hard to skim. This is the same
 * transformation SillyTavern applies to messages (script.js messageFormatting),
 * reimplemented here so we get the highlighting without the rest of that
 * function's chat-specific behaviour.
 *
 * @param {string} text
 * @returns {string} text with <q> wrappers, quote characters preserved inside
 */
export function markQuotes(text) {
    // Double quotes delimiting an HTML attribute are not speech. Park them on a
    // character that can't appear in card text, then put them back afterwards.
    let out = String(text).replace(/<([^>]+)>/g, (_, contents) => '<' + contents.replace(/"/g, '\ufffe') + '>');

    out = out.replace(QUOTES, (match, ...groups) => {
        const quoted = groups.slice(0, 6).find(Boolean);
        return quoted ? `<q>${quoted}</q>` : match;
    });

    return out.replace(/\ufffe/g, '"');
}

export function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

/** Last-resort renderer if showdown or DOMPurify is missing: plain text, line breaks kept. */
function renderPlain(text) {
    return escapeHtml(text).replace(/\n/g, '<br>');
}

/**
 * Render one block of card text to sanitized HTML.
 * @param {string} text
 * @returns {string} HTML safe to assign with innerHTML
 */
export function renderBlock(text) {
    const raw = typeof text === 'string' ? text : '';
    if (!raw) return '';

    const conv = getConverter();
    const purify = globalThis.DOMPurify;
    if (!conv || !purify?.sanitize) return renderPlain(raw);

    const html = conv.makeHtml(markQuotes(raw));
    return purify.sanitize(html, {
        FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'input', 'link', 'meta', 'base'],
        ALLOW_DATA_ATTR: false,
    });
}

/**
 * Fill a container with rendered markdown and make any links safe to click.
 *
 * Card text is third-party content, so links open in a new tab with the opener
 * severed — a note that links out should never be able to reach back into the
 * SillyTavern window.
 *
 * @param {HTMLElement} el
 * @param {string} text
 */
export function paint(el, text) {
    el.innerHTML = renderBlock(text);
    for (const a of el.querySelectorAll('a[href]')) {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
    }
}
