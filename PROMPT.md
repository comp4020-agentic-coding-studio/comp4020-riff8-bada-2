# Task: Turn Marks into an asynchronous "Gartic Phone" game, and redesign the pages

## Context

This is the existing site at https://comp4020-riff8-bada-2.fly.dev/ ("Marks"). Today it is a guestbook: a form with **Your name** and **Your mark**, and a newest-first list of entries. A readme page explains what the site is for.

Before changing anything, read the existing codebase (stack, routing, data storage, templates, styles, deployment config for Fly.io) and **follow its conventions**. Do not introduce a new framework unless the current one cannot do this. Keep the existing tone: quiet, low-pressure, "it'll still be here when you're back."

## Goal

Each mark becomes its own **chain** in a game of telephone. A chain alternates between text and drawing and **keeps growing for as long as people add to it**. Players add one step at a time, seeing **only the step immediately before theirs**. After you add your step, you unlock the whole chain so far.

## Core rules

1. **Each mark is a separate chain.** Creating a new mark starts a new chain with step 1.
2. **Steps alternate by type:**
   - Step 1: text (the starting phrase, written by the creator)
   - Step 2: drawing of the previous text
   - Step 3: text caption describing the previous drawing
   - Step 4: drawing, and so on
   - Odd steps are text, even steps are drawings.
3. **No maximum length.** A chain never completes or closes. Anyone eligible can always add the next step.
4. **Blind play.** When you play the next step of a chain, you see only the latest step (the text or the drawing), never earlier ones.
5. **Reveal after you play.** Once you submit your step, you can view the full chain so far, in order, on that mark's thread page. This stays unlocked for you permanently, and you see new steps added later too. Until you have played in a chain (or created it), its thread page shows only the latest step and the "play next step" action.
6. **Turn limits.** A person cannot play two steps in a row in the same chain, and can play in a given chain only once. Identify people by the existing name field plus a lightweight client-side token (cookie or localStorage id). Do not require accounts.
7. **Persistence.** Everything is stored server-side and survives restarts and redeploys. Migrate existing marks so each old entry becomes a chain with one text step.

## Pages and behavior

### Home (`/`)
- Replace the guestbook list with a list of chains, most recently updated first.
- Each chain shows **only its latest step**: the text, or the drawing as an image. Also show how many steps the chain has, the author of the latest step, and the time.
- Each chain has a **"Play next step"** action, or "You've played here" with a link to the full chain if the person already took part, or "Wait for someone else" if they wrote the latest step.
- The existing "start a mark" form stays, now framed as starting a new chain.
- Empty state (no chains yet): invite the person to start the first one.

### Thread page (`/mark/<id>`)
- Not yet played: show the latest step and the play action. Nothing else.
- Played: show the **full chain top to bottom**, each step with its type, author, and time, so the drift is easy to read. Put the first step and the latest step prominently at the top so the contrast is visible at a glance.

### Play page (`/mark/<id>/play`)
- Shows the previous step only.
- If the next step is a drawing: show the previous text and a canvas.
- If the next step is text: show the previous drawing and a text field with a sensible length limit (match the existing mark limit).
- Name field prefilled from the person's last-used name.
- On submit, validate, save, then redirect to the thread page where the chain is now visible.

## Drawing canvas

- HTML canvas, works with **mouse and touch** (use pointer events), usable on a phone.
- **Multiple colors in one drawing.** The person can switch colors at any time and use as many colors as they like in a single drawing. Each stroke keeps the color it was drawn with, and changing the selected color never affects existing strokes.
- Tools: brush, eraser, undo (per stroke, so it works across colors), clear, 3 brush sizes.
- Color controls: a palette of about 10 swatches (including black and white) with the current color clearly marked, plus a custom color picker for any other color. Keep the last few used custom colors as extra swatches.
- Every swatch is a labelled, keyboard-reachable button (for example "Coral"), and the selected state is shown with more than color alone (such as a ring or check mark).
- Eraser paints with the canvas background color, not transparency, so exports stay consistent.
- Export as a small PNG (resize to a fixed width, for example 600px) and send it to the server. Enforce a maximum payload size server-side.
- Disable submit if the canvas is blank.
- Accessibility: keyboard-reachable tool buttons with labels. Provide an optional **alt text** field when submitting a drawing and use it as the image `alt`.

## Data model (adapt to the existing storage)

- `chains`: `id`, `created_at`, `updated_at`, `step_count`
- `steps`: `id`, `chain_id`, `position` (1-based), `type` (`text` or `drawing`), `content` (text, or image path/blob reference), `alt_text` (nullable), `author_name`, `author_token`, `created_at`
- Unique constraint on (`chain_id`, `position`) so two people cannot claim the same step. Handle the race: if someone submits after another player has already taken the step, show a friendly message and send them to the updated chain.
- Index on `chains.updated_at`.

## Visual design

The current page is a plain form and list. Redesign all pages (home, thread, play, readme) so the site feels made, not templated. Apply the design to the real content: marks, chains, hand-drawn steps, and the way a phrase drifts as it is passed along.

**Concept.** A mark is something someone left behind, and a chain is a message passed hand to hand. The one memorable element is the **thread page's chain**: steps are laid out as a vertical strip joined by a thin connector line, with text steps and drawing steps visually distinct (text sits on a plain ruled-note surface, drawings sit on a slightly tilted sheet with a soft edge). The first and latest steps sit side by side at the top, labelled "It started as" and "It's now", so the drift is the first thing you see. Keep everything else quiet.

**Palette** (adjust if the existing brand has colors, and avoid a cream-and-terracotta look or a black page with one neon accent):
- Paper: `#EEF1F6` (cool light grey-blue page background)
- Surface: `#FFFFFF` (cards, canvas)
- Ink: `#1C2438` (text, a deep blue-black rather than pure black)
- Marker blue: `#3D5AFE` (primary actions, links)
- Marker coral: `#FF6B6B` (drawing steps, highlights)
- Marker yellow: `#FFD23F` (small badges such as the step count)
- Dark mode: derive from the same tokens (deep navy surface, same marker colors) via `prefers-color-scheme`.

**Type.** Two clearly different families, loaded with real fallbacks (or self-host if external fonts are blocked):
- Display and headings: *Bricolage Grotesque* (fallback `system-ui, sans-serif`), used large and tight on the home headline and chain titles.
- Body and form text: *Atkinson Hyperlegible* (fallback `system-ui, sans-serif`), at least 17px, line length under 70 characters, sentence case throughout.

**Layout.**
- Home: a single column on mobile, a two-column masonry-style grid of chains on wide screens. Each chain card has a large latest step, a small step-count badge, and one clear action. Do not make every card identical: let drawing cards show the image large and text cards show the phrase in display type.
- Thread: centered column, max width about 640px, strip with connector line as described above.
- Play: the previous step on top, the canvas or text field directly below, a single primary button.
- Left-align text. Use generous spacing and a consistent 8px spacing scale. Use a larger corner radius on cards and a smaller one on buttons and inputs.

**Interaction and motion.**
- No scattered entrance animations or hover effects. One moment of motion only: when you submit your step, the thread page opens with the earlier steps unfolding downward from the latest one, once, to mark the reveal. Respect `prefers-reduced-motion`.
- Buttons and inputs have visible focus states and 44px minimum touch targets.

**Copy.** Plain, specific verbs and one name per action throughout (for example "Start a chain", "Play next step", "Add your step"). Errors say what went wrong and how to fix it, with no apologies. Empty states invite action ("No chains yet. Start the first one.").

**Quality floor.** Responsive down to 360px wide, WCAG AA contrast, keyboard navigable, images always have alt text.

## Safety and robustness

- Escape all user text on output. Validate and sanitize uploads (only PNG, size cap, verify the image decodes).
- Basic rate limiting per client token or IP.
- A **Report** link on each step that flags it. Flagged steps are hidden from the public view pending review, and the chain shows "a step was hidden." Keep the review mechanism simple (a flag column and an admin-only list).

## Update the readme page

Rewrite "what this is for" in a few short sentences: start a chain, play the next step of someone else's, then see how far it drifted. Apply the new design to it.

## Out of scope (do not build)

- Accounts or login, points, leaderboards, streaks
- Real-time or synchronous rooms
- Reactions or comments
- A maximum chain length or any "complete" state

## Acceptance checklist

- [ ] Creating a mark creates a chain with a text step 1 that appears on home as a one-step chain.
- [ ] From another browser, I can play step 2 (a drawing) seeing only step 1's text.
- [ ] Step 3 (text) shows only step 2's drawing, never step 1.
- [ ] After submitting my step, I land on the thread page and see the whole chain so far.
- [ ] Before playing, the thread page reveals only the latest step.
- [ ] I cannot play twice in the same chain or play two steps in a row.
- [ ] A chain can keep growing past 10 steps with no limit or closed state.
- [ ] The canvas works with touch on a phone-sized viewport.
- [ ] Existing marks still appear after migration.
- [ ] Data persists across a Fly.io redeploy.
- [ ] All pages follow the visual design above, work at 360px wide, and pass a keyboard-only run-through.

## Working style

Make the smallest set of changes that satisfies the above. Summarize what you changed, note any assumptions (especially about storage, identity, and fonts), and list anything from the checklist you could not verify.
