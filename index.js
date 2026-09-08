// index.js
// SillyTavern Character Info — extension entry point.
//
// One job: show the card for the character you're currently talking to, fast,
// read-only, without leaving the chat. Character Management is the alternative
// and it's a bad one mid-roleplay — it loads the full editor, shows the
// description and the creator's notes in two different formats, and hides
// personality and scenario behind an extra click. A second browser tab is
// worse still: on an iPad, switching tabs can kill an in-flight generation.
//
// So this is deliberately the smallest thing that works: a slash command and a
// wand-menu button, both opening one overlay in the existing document, with
// each section rendered only when you actually open it.
//
// This module owns everything SillyTavern-shaped (context lookups, settings,
// command and menu registration). card.js is pure data, modal.js is pure DOM.

import { buildSections, buildSubtitle } from './card.js';
import { openInfoModal, closeInfoModal, isOpen } from './modal.js';

const MODULE_NAME = '[Character Info]';
const EXT_KEY = 'CharacterInfo';
const BUTTON_ID = 'character_info_wand_button';

/**
 * Extension settings, initialised on first access.
 * `open` maps section id -> whether it's expanded. It's global rather than
 * per-character on purpose: the point is that the modal always opens the way
 * you left it, so the sections you never read stay out of the way on every card.
 */
function getSettings() {
    const { extensionSettings, saveSettingsDebounced } = SillyTavern.getContext();
    if (!extensionSettings[EXT_KEY]) {
        extensionSettings[EXT_KEY] = {};
        saveSettingsDebounced?.();
    }
    const s = extensionSettings[EXT_KEY];
    if (typeof s.open !== 'object' || s.open === null) s.open = {};
    return s;
}

function rememberOpenState(id, open) {
    const s = getSettings();
    if (s.open[id] === open) return;
    s.open[id] = open;
    SillyTavern.getContext().saveSettingsDebounced?.();
}

/** Tag names attached to a character, in SillyTavern's own order. */
function getTagNames(context, avatar) {
    const ids = context.tagMap?.[avatar];
    if (!Array.isArray(ids) || ids.length === 0) return [];
    const byId = new Map((context.tags ?? []).map(t => [t.id, t.name]));
    return ids.map(id => byId.get(id)).filter(Boolean);
}

/**
 * Resolve the character whose card we should show, or null with a toast
 * explaining why we can't.
 *
 * Group chats are out of scope: there's no single "the character you're
 * talking to", and a member picker is a different, bigger feature. If that's
 * ever wanted, this is the function to grow — everything downstream already
 * works off one character id.
 */
function resolveCharacter(context) {
    if (context.groupId) {
        toastr.info('Character Info works on single-character chats. Select a character to see its card.', 'Character Info');
        return null;
    }
    const chid = context.characterId;
    if (chid === undefined || chid === null || chid === '') {
        toastr.info('No character selected.', 'Character Info');
        return null;
    }
    const character = context.characters?.[chid];
    if (!character) {
        toastr.warning('Could not find the current character.', 'Character Info');
        return null;
    }
    return { chid, character };
}

/** Build the modal contents for the current character and show it. */
export async function showCharacterInfo() {
    // The overlay covers the wand button and the chat box, so this mostly
    // guards against a second invocation from a keybind or a quick reply
    // stacking a duplicate modal.
    if (isOpen()) {
        closeInfoModal();
        return;
    }

    const context = SillyTavern.getContext();
    const resolved = resolveCharacter(context);
    if (!resolved) return;
    const { chid } = resolved;

    // Cards in a large library are loaded shallow (metadata only). This fetches
    // the full card for exactly one character and is a no-op once it's loaded,
    // which is the normal case for whoever you're already chatting with.
    try {
        await context.unshallowCharacter?.(chid);
    } catch (e) {
        console.error(MODULE_NAME, 'failed to load the full card', e);
    }

    const freshContext = SillyTavern.getContext();
    const character = freshContext.characters?.[chid];
    if (!character) {
        toastr.warning('Could not find the current character.', 'Character Info');
        return;
    }

    const fields = freshContext.getCharacterCardFields({ chid });
    const sections = buildSections(fields);
    const subtitle = buildSubtitle({
        version: fields.version,
        creator: character.data?.creator,
        tags: getTagNames(freshContext, character.avatar),
    });

    openInfoModal({
        name: character.name || 'Unnamed character',
        avatarUrl: character.avatar ? freshContext.getThumbnailUrl('avatar', character.avatar) : '',
        subtitle,
        sections,
        openState: getSettings().open,
        onToggle: rememberOpenState,
    });
}

// ── Registration ─────────────────────────────────────────────────────────────

function addWandButton() {
    if (document.getElementById(BUTTON_ID)) return true;
    const container = document.getElementById('extensionsMenu');
    if (!container) return false;

    const button = document.createElement('div');
    button.id = BUTTON_ID;
    button.className = 'list-group-item flex-container flexGap5 interactable';
    button.tabIndex = 0;
    button.title = 'Show the current character\'s card — read-only';
    button.innerHTML = '<div class="fa-solid fa-id-card extensionsMenuExtensionButton"></div><span>Show Character Info</span>';
    button.addEventListener('click', showCharacterInfo);
    container.appendChild(button);
    return true;
}

function registerSlashCommand() {
    const { SlashCommandParser, SlashCommand } = SillyTavern.getContext();
    if (!SlashCommandParser || !SlashCommand) {
        console.warn(MODULE_NAME, 'slash command API unavailable; skipping /info');
        return;
    }
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'info',
        aliases: ['charinfo', 'cardinfo'],
        callback: async () => {
            await showCharacterInfo();
            return '';
        },
        helpString: 'Open a read-only view of the current character\'s card: creator\'s notes, description, personality, scenario, greetings, and example dialogue. Run it again to close.',
    }));
}

function init() {
    registerSlashCommand();

    // The wand menu is rendered into the body after extensions load, so the
    // container usually isn't there yet on first try.
    if (!addWandButton()) {
        const observer = new MutationObserver(() => {
            if (addWandButton()) observer.disconnect();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // A card left open across a character switch would be showing the wrong
    // person's description, which is worse than showing nothing.
    const { eventSource, event_types } = SillyTavern.getContext();
    eventSource?.on(event_types.CHAT_CHANGED, closeInfoModal);
}

try {
    init();
} catch (e) {
    console.error(MODULE_NAME, 'failed to initialise', e);
}
