# Crit 9 riff: make the wall live, and nothing more

The brief is crit 9, "All at once":
https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/09-all-at-once/
Fetch it fresh before you start. Its two lines that matter here:

- A posted mark appears in every other open session within about a second,
  with no reload.
- One decision about how the app behaves when several people use it at once
  is written down in the repo, with the options considered and what the
  choice costs.

This is a small change to a small app. Do exactly the three steps below and
stop. Don't add features the steps don't ask for. Commit after each step,
with `pnpm check` green, and keep `main` deployable.

## 1. Live marks over Server-Sent Events

- Add `GET /events` as a `text/event-stream`, using built-in `node:http` only.
  No new dependency.
- Keep an in-memory set of open connections. [fly.toml](fly.toml) pins the
  app to one machine, so in-process broadcast is correct. Say that in a
  one-line comment.
- After `insertMark` succeeds, broadcast the new mark to every connection.
  - Each event's `id:` is the mark's row id.
  - On reconnect, replay marks newer than the `Last-Event-ID` header.
- Send a `: ping` comment every 25 s so Fly's proxy doesn't close idle
  streams. Clean up the timer and the connection on `close`.
- Add `data-id` to each mark item in `marksList`.
- Add one small inline `<script>`. It opens an `EventSource` and prepends
  each incoming mark to `ol.marks`.
  - Skip any id that is already on the page.
  - Build the new item with DOM APIs and `textContent`, never `innerHTML`
    with user text.
  - If the wall was empty, replace the "No marks yet" line with the list.
- Posting stays exactly as it is: a form POST and a 303 redirect. Don't
  rewrite it to use `fetch`. With JS off, the wall must work exactly as
  it does today.

**The only visual change:** a mark that arrives live gets a brief highlight,
a left border that fades from `currentColor` to the normal border over
about 2 s. Respect `prefers-reduced-motion` by skipping the fade. Change
no other styles.

## 2. The written decision

Write `docs/adr/0001-reconnect-and-return.md` as a short architecture
decision record: context, options, decision, consequences. The question
is: *what does someone see when their connection drops, or when they come
back the next day?* Weigh these options:

- Replay the missed marks automatically using `Last-Event-ID` (the choice).
- Show a "new marks, reload to see" notice.
- Show nothing until they reload.

Argue the choice from [README.md](README.md)'s idea of good: a small room
where marks are permanent and the wall is read top to bottom. State what
it costs: replay can drop a burst of old marks onto the top of the page.
The pod will argue for an option you didn't pick, so give the rejected
options a fair case.

Then edit README.md's "What's deliberately not here yet" so it no longer
lists real-time, and link the ADR.

## 3. Tests

Add these to [spec/marks.test.ts](spec/marks.test.ts), which runs against
the live server:

- **Live delivery.** Open `/events` with `fetch` and read the stream. POST
  a mark with a unique marker, and assert the marker arrives on the stream
  within 1500 ms. Close the stream afterwards so vitest exits.
- **Replay.** Reconnect with a `Last-Event-ID` older than a fresh mark, and
  assert that the mark is replayed.

Keep every existing test and [spec/invariants.test.ts](spec/invariants.test.ts)
green.

## Leave alone

- No presence, no typing indicator, no reactions, no replies.
- No AI features.
- No accounts, edit or delete. The CLAUDE.md rules still hold.
- No new dependencies. `marked` stays the only one.
- No logging.
- No restyling beyond the one highlight above.
- Don't touch the CLAUDE.md riff block.

## Done means

Open two browser windows on the wall. Post in one, and the mark appears in
the other within a second, with a brief highlight. Turn JS off, and posting
still works with a reload. Check this with `agent-browser` locally, then
deploy and check it again on the live Fly URL. Delete this `prompt.md` in
your last commit.
