# SillyTavern Character Info

A read-only card viewer for the character you're already talking to. One slash command or one wand-menu click puts the creator's notes, description, personality, scenario, greetings, and example dialogue in a single collapsible modal — over the chat, in the same tab, without touching the editor.

It exists because the alternatives are bad mid-roleplay:

- **Character Management** loads the full editor, renders the description and the creator's notes in two different formats, and hides personality and scenario behind an extra click and an X to get back out.
- **A second tab or window** costs you tab management, and on an iPad switching tabs can kill an in-flight generation.

Rereading the card is how you stay consistent with it. Locations, names, and the scenario aren't secrets — knowing them lets you play along instead of around. This makes that a two-second look during the dead time while the model is writing.

## Installation

In SillyTavern, go to **Extensions → Install extension** and enter:

```
https://github.com/ember-and-ink/SillyTavern-CharacterInfo
```

Or clone it manually into your user extensions directory:

```bash
cd data/default-user/extensions
git clone https://github.com/ember-and-ink/SillyTavern-CharacterInfo
```

Reload SillyTavern.

## Usage

Open it either way:

- **`/info`** in the chat box (aliases: `/charinfo`, `/cardinfo`)
- **Extensions (wand) menu → Show Character Info**

Close with **Esc**, the **✕**, or a tap outside the modal. Switching characters closes it too, so you're never reading the wrong card.

Inside:

- Each section is a collapsible row with a size hint (`820`, `1.2k`, `14k`) so you know what opening it costs.
- **⌄⌄** in the header expands or collapses everything at once.
- Whichever sections you leave open stay open — for every character, every time. Sections you never read stay out of the way.
- Sections the card leaves empty aren't shown at all.
- Card text is coloured the way your theme colours the chat: dialogue in `--SmartThemeQuoteColor`, italics in `--SmartThemeEmColor`, underline in `--SmartThemeUnderlineColor`. The point is skimmability — narration and speech shouldn't be one undifferentiated block.
- Multi-part sections (each alternate greeting, each example exchange) box their parts separately, and card art is capped at 45% of the viewport so a banner image doesn't cost you the whole screen before the text starts.

Sections, in order: **Creator's Notes**, **Description**, **Personality**, **Scenario**, **First Message**, **Alternate Greetings**, **Example Dialogue**.

Nothing here writes to your card. There is no edit mode and no save button.

## What it deliberately doesn't do

- **No editing.** Reading and editing are different jobs; the editor already exists.
- **No group chats.** There's no single "character you're talking to" in a group, so `/info` declines with a toast. `resolveCharacter()` in `index.js` is the one place that would need to grow if that ever changes.
- **No `<style>` blocks from creator's notes.** Cards that ship a whole themed layout in a `<style>` tag get it dropped — letting it loose would restyle SillyTavern itself. Inline `style` attributes survive, so the common coloured-box notes still look about right.
- **No chat-message formatting.** It doesn't route card text through SillyTavern's message renderer, because that runs your regex scripts at AI-output placement — a script meant to strip narration from replies would quietly chew holes in the description you came here to read.

## How it stays light

- Section bodies are markdown-rendered the first time you open them, not when the modal opens. On a card with a 30k-character description, opening the modal costs a header and seven collapsed rows.
- It's one overlay in the existing document — no iframe, no second tab, no route change, nothing that can interrupt a streaming response.
- Markdown and sanitising use the `showdown` and `DOMPurify` copies SillyTavern already loads. No extra downloads, no bundled dependencies; the extension ships as raw ES modules.
- Cards in a large library load shallow; this unshallows exactly one character, and that's already a no-op for whoever you're chatting with.

## Layout

| File | Role |
| --- | --- |
| `index.js` | Everything SillyTavern-shaped: context lookups, settings, `/info`, the wand button |
| `card.js` | Pure — turns a card-field bundle into the ordered section list |
| `render.js` | Markdown → sanitised HTML |
| `modal.js` | Pure DOM — the overlay, lazy section rendering, collapse state |
| `style.css` | Theme-aware styling, full-bleed under 1000px |

## Development

```bash
make install   # npm ci
make check     # lint + tests (what CI runs)
```

The tooling is dev-only — SillyTavern loads only what `manifest.json` lists. `card.js` is tested as pure logic; `modal.js` and `render.js` are tested under jsdom against the real DOMPurify.

## License

MIT
