# Process overview

Crit 8's bar is proof of life: something deployed, doing one real thing for a
stranger, with a trace that's still there when they come back. Before writing
any code I read the final project brief's own pointers toward the small web
and games made for a handful of friends, which led to Robin Sloan's
home-cooked-app essay and Ink & Switch's malleable-software piece -- both
cited in README.md, which is the actual first deliverable this week: a stance
on what good means before a feature list.

The app itself, Marks, is a shared noticeboard: a name, a short line, posted
and visible immediately, still there on return. Two decisions came straight
out of the README's argument rather than habit. First, no accounts -- a
random id in a cookie is enough to tell two visitors apart and to mark a
post as "yours," which is all a room this size needs
([`5c9221a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-bada/commit/5c9221ac21c123760282a470fbc8f29222ecf9a5)).
Second, marks are permanent: no edit, no delete route exists at all, because
a wall that pretends to be moderatable is a worse promise than one that
plainly isn't.

The stack choice was more pragmatic than philosophical: Node 24 strips
TypeScript's erasable syntax natively, so `src/*.ts` runs straight, no build
step; and `node:sqlite` is built into the same runtime, so the Fly image
needs no native addon and no separate database service, just the one file
Fly already mounts at `/data`. Before ever touching Fly I built the actual
Dockerfile locally, ran the image, posted a mark, restarted the container,
and confirmed the mark was still there -- the same guarantee the volume is
meant to provide, checked directly rather than assumed from reading the
config.

Before deploying, I opened the running app in a real browser at both marking
viewports and walked the whole form with the keyboard alone (Tab to the name
field, to the mark field, to the submit button, Enter to send) rather than
just reading the markup and assuming it would work.

The corrections after the first deploy came from asking where the app's
own promises could quietly fail, not from another playtest. A name or mark
made only of zero-width characters passed `.trim()` and posted a blank
trace onto a wall whose point is an honest one; a real-browser axe run (the
build's own checks can't see layout) found the posting form sat outside
every landmark. The sharpest was a cookie: reading every client-controlled
value the server decodes before routing, a raw `Cookie: visitor=%` made
`decodeURIComponent` throw on every request, `GET /` included, and since the
crash came before any `Set-Cookie` could replace the bad value, that visitor
would have been locked out until they cleared cookies by hand
([`257c251`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-bada/commit/257c25121b58818e0b19f6b221230d4ba88c69c8)).

What's deliberately not here yet: real-time updates and multi-tab sync are
crit 9's bar, not this one; server-side logging is crit 11's. CLAUDE.md now
says so explicitly, so a later run building ahead of the crit that's open is
a decision to notice, not a default
([`e92e066`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-bada/commit/e92e0663b1770718013c93da0461b4bb1f6d542c)).

## Crit 9: All at once

This run was one shot from a pod's `prompt.md`, with nobody to ask, so the
brief was the prompt and the crit 9 source was context. Its four steps were
specific enough that the job was mostly making the calls it left open and
saying so in the commit messages.

Live marks went in first
([`dae9606`](https://github.com/comp4020-agentic-coding-studio/comp4020-riff8-bada-2/commit/dae9606069dec43c8cb7663b99fb19ff0b18a1d9)):
`GET /events` over plain `node:http`, an in-memory set of connections
(correct only because `fly.toml` pins one machine), each event's `id:` the
mark's row id. Two calls the prompt didn't make. First, "yours" is worked
out per connection on the server, so no visitor's id ever goes out in an
event. Second, `Last-Event-ID` only exists after a reconnect, which leaves
a gap between rendering the page and opening the stream. So the first
connect passes the newest id on the page as `?since=`, and the header wins
after that.

Drawings came second
([`e7164d5`](https://github.com/comp4020-agentic-coding-studio/comp4020-riff8-bada-2/commit/e7164d547fe5b68b27a0507efd2475b84cd38ef9)):
strokes as flat integer runs on a 600×300 grid, re-validated on the server
and only ever rendered as numbers in SVG path data. A drawing that fails
validation refuses the whole mark with a 400 rather than quietly posting
the text, since only tampering can produce one. The canvas ships `hidden`
and the script reveals it, so with JavaScript off the form is exactly the
old one.

The corrections came from checking in a real browser before committing,
not from the tests. Synthetic touch- and pen-typed pointer events recorded
only each stroke's first point: `getCoalescedEvents()` returns an empty
array for them rather than `undefined`, so the `?? [e]` fallback never
fired. The canvas was also 2px wider than the inputs beside it, with its
border skewing the coordinate mapping. One test failure looked like a
broadcast bug but was the test itself: a 43-character marker used as a
name, which the server truncates to 40.

Verified: two tabs, a drawing from one reaching the other in about 400 ms
including CLI overhead; text posting with scripts off
(`--blink-settings=scriptEnabled=false`); the server killed and restarted
under an open tab, a mark posted in the gap, and the tab catching up by
itself; the real Docker image passing the spec in 33 MB of its 256. Not
verified: a physical touchscreen or pen, since this CLI can't produce real
touch input. The reconnect decision is in
[ADR 0001](docs/adr/0001-reconnect-and-return.md)
([`8bfd826`](https://github.com/comp4020-agentic-coding-studio/comp4020-riff8-bada-2/commit/8bfd8260a51b46da29e34bb1eb9efd84ba67fe5d)).
