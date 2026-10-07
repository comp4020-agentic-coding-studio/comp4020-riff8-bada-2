# 1. Reconnect and return: replay missed marks

Status: accepted

## Context

Marks is now live: a mark posted in one browser appears in every other open
session within about a second, pushed over Server-Sent Events from
`GET /events`. Live delivery only covers the time someone is connected,
though. A laptop lid closes, a phone drops off the wifi, a Fly redeploy
restarts the one machine and every open stream drops with it. So the
question is what someone sees when their connection drops and comes back,
or when they come back the next day.

[README.md](../../README.md) sets the terms. This is a wall for a small
room, a dozen people at most. Marks are permanent, with no edit and no
delete, and the wall has no pagination, filter or ranking: reading it top
to bottom, newest first, *is* the interface. A missed mark is a missed
contribution from someone you know, not a missed item in a feed, so a design
that loses marks quietly breaks the one promise the app makes.

## Options

**Replay missed marks automatically.** Every event carries the mark's row
id as its SSE `id:`. When a dropped `EventSource` reconnects, the browser
sends the last id it saw as `Last-Event-ID`, and the server sends every mark
newer than that before going live again. The first connect from a freshly
loaded page passes the newest id on the page instead, so a mark posted
between render and connect isn't lost either.

**Show a "new marks, reload to see" notice.** On reconnect, the page asks
whether anything changed and, if so, shows a banner. The visitor decides
when the wall moves. Its fair case is that nothing appears under someone's
eyes without their say-so, the notice is honest that they were away, and a
reload gives them the whole wall in its true order. It's what plenty of
feed readers do, for good reason.

**Show nothing until they reload.** The stream just resumes from now on.
Its fair case is that it's the simplest thing that could work: no replay
query, no banner, and for a room this small someone coming back the next
day reloads anyway, which gets them everything. The server-rendered page is
already the source of truth.

## Decision

Replay, using `Last-Event-ID`. Ids are already monotonic row ids, marks are
never edited or deleted, so "everything after id N" is a complete,
unambiguous description of what someone missed, and the server can answer
it with one indexed query. That fits the README's promise better than the
alternatives: the reconnecting visitor ends up looking at the same wall as
everyone else, with no extra step. The notice option makes the visitor do
work to recover something the server already knows how to send, and the
show-nothing option leaves an open tab silently wrong, which is worse than
either. A tab that looks connected but is missing marks is the failure a
small room is least likely to notice and most likely to be hurt by.

Coming back the next day is the same case with a longer gap: the page load
renders the whole wall from SQLite, and the first connect replays anything
newer than what it was rendered with.

Drawings don't change this. Every mark, drawing included, is an immutable
snapshot taken at post time. Two people drawing at once are making two
marks, stored as two rows with their own ids, never two edits to one
shared thing, so there is no conflict to resolve and replay never has to
merge anything.

## Consequences

- After a long drop, a burst of older marks can appear at the top of the
  wall at once, each with the live highlight. They arrive oldest first and
  each is prepended, so they end up in the right order, but a reader
  halfway down the wall gets content shifting above them. That's the cost
  the notice option avoids, and it's accepted here because the room is
  small enough that the burst is a handful of marks, not a flood.
- A replayed mark looks the same as one posted live. Someone can't tell
  "this just happened" from "this happened while you were away"; the
  timestamps say, but the highlight doesn't.
- The server has to keep answering `Last-Event-ID` queries forever, which
  is cheap because marks are permanent. If deletion is ever added, replay
  would need to send removals too, and this decision should be revisited.
- In-process broadcast assumes one machine, which `fly.toml` pins. A second
  machine would split the room in two until something shared carried events
  between them.
