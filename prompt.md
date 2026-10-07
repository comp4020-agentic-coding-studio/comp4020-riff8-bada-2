# Crit 9 riff: make the wall live, and let people draw

The brief is crit 9, “All at once”:
https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/09-all-at-once/
Fetch it fresh before you start. A posted change must appear in every other
open session within about a second, without a reload. One decision about how
the app behaves with several people at once must be written down, with the
options considered and the cost of the choice.

Extend Marks with a small drawing canvas. A visitor can leave a short text
mark, a drawing, or both together. Keep this a small-room noticeboard: each
contribution is a finished mark on the wall, not a shared document or public
feed.

This is a small change to a small app. Do the four steps below and stop. Don't
add features the steps don't ask for. Keep the app runnable and pnpm check
green as you work. Do not edit agent/ or the riff instructions at the top of
CLAUDE.md.

## 1. Live marks over Server-Sent Events

- Add GET /events as text/event-stream, using built-in node:http only. No new
dependency.
- Keep an in-memory set of open connections. fly.toml pins the app to one
machine, so in-process broadcast is correct. Say that in a one-line comment.
- After a mark is saved, broadcast it to every connection, including its
optional drawing.
  - Each event's id: is the mark's row id.
  - On reconnect, replay marks newer than the Last-Event-ID header.
- Send a : ping comment every 25 s so Fly's proxy doesn't close idle streams.
Clean up the timer and connection on close.
- Add data-id to each mark item in marksList.
- Add one small inline script. It opens an EventSource and prepends each
incoming mark to ol.marks.
  - Skip any id already on the page.
  - Build new items with DOM APIs and textContent, never innerHTML with
user-provided content.
  - If the wall was empty, replace the “No marks yet” line with the list.
- A live mark gets a brief highlight: its left border fades from currentColor
to the normal border over about 2 s. Respect prefers-reduced-motion by
skipping the fade.

## 2. Add a drawing canvas to each mark

- Add a responsive canvas to the existing posting form. Support mouse, touch,
and pen input with Pointer Events. Include a clear action and a visible
indication that a drawing will be included when the visitor submits.
- A contribution may contain text, a drawing, or both. Drawing-only posts must
work, while the existing text-only form must still work with JavaScript
disabled.
- Store drawings with their marks in the existing SQLite database. Migrate
existing databases safely. Use a compact structured stroke representation;
validate its shape, point count, and size on the server before storing it.
- Render drawings on the server-rendered wall and in live updates. Safely
render validated coordinates as SVG paths or equivalent; never insert
client-supplied SVG or HTML into the page. Text remains escaped as before.
- Keep drawings attached to immutable posts. Simultaneous posts create
separate marks; one visitor's drawing must not overwrite another's. Do not
add shared-canvas collaboration or presence.
- Keep the current text-only form POST and 303 redirect. JavaScript enhances
drawing and live updates; it is not required for reading or posting text marks.

The only visual changes are the canvas and its controls, drawings shown with
marks, and the brief highlight for a live mark. Change no other styles.

## 3. Record the multi-user decision

Write docs/adr/0001-reconnect-and-return.md as a short architecture decision
record with context, options, decision, and consequences. The question is:
what does someone see when their connection drops, or when they come back the
next day? Weigh these options:

- Replay missed marks automatically using Last-Event-ID (the choice).
- Show a “new marks, reload to see” notice.
- Show nothing until they reload.

Argue from README.md: this is a small room where marks are permanent and the
wall is read top to bottom. Explain the cost of replay: a burst of older marks
can appear at the top. Give the rejected options a fair case. Also state that
drawings are immutable snapshots, so simultaneous posts become separate
marks rather than conflicting edits.

Edit README.md's “What's deliberately not here yet” section so it no longer
lists real-time updates, and link to the ADR. Update the README's definition
of good only if the drawing interaction changes that definition.

## 4. Tests and finish

Add focused tests to spec/marks.test.ts, which runs against the live server:

- Live delivery: open /events with fetch, read the stream, post a mark with a
unique marker, and assert the marker arrives within 1500 ms. Close the stream
so Vitest exits.
- Replay: reconnect with a Last-Event-ID older than a fresh mark, and assert
the mark is replayed.
- Drawings: post a small valid drawing and assert it is persisted and
rendered. Check malformed or oversized drawing data is rejected safely.
- Keep every existing test and spec/invariants.test.ts green.

Before finishing, verify the canvas works with pointer input and that a text
mark and a drawing posted in one browser session appear in another within
about a second. Check text-only posting with JavaScript disabled. Run pnpm
check. Keep the app deployable within the existing Docker, one Fly volume,
and 256 MB machine constraints. Do not deploy or push during this pod run;
the harness handles the push and CI deploys it.

Write the required process account in PROCESS.md and a 150–300 word
reflections/crit-9.md titled “All at once,” answering both standing reflection
prompts. Work in small, meaningful commits. In your final commit, delete this
prompt.md.
