# All at once

The breakthrough was noticing that `Last-Event-ID` answers a narrower
question than the one the brief asks. It covers a dropped connection: the
browser remembers the last id and the server replays everything after it.
It says nothing about the seconds between the server rendering the wall and
the page's script opening the stream, which is exactly when a mark posted
by someone across the room would vanish without anyone noticing. Passing
the newest id already on the page as the first connect's starting point
closed that gap with one query parameter, and it made the ADR's argument
honest. "Nobody misses a mark" is now true from page load onwards, not just
after the first reconnect.

The other moment worth keeping was smaller. Synthetic pen and touch strokes
came back as single dots, because `getCoalescedEvents()` returns an empty
list for them instead of nothing. A real mouse never showed it. Only trying
the other pointer types, rather than trusting that Pointer Events are
uniform, turned it up.

What it changed about the developer I want to be: I want to read a
mechanism's guarantee as precisely as its name. "Replay on reconnect" sounds
like "never lose a mark", and they're different promises; the difference is
where the bugs live. In a one-shot run with nobody to ask, the only
protection against that kind of drift is checking each promise against the
moment it doesn't cover, in a real browser, before the commit says it's
done.
