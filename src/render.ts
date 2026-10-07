import type { Mark } from "./db.ts";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

const timeFormat = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}

export function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light dark; }
  body {
    font: 1rem/1.5 system-ui, sans-serif;
    max-width: 38rem;
    margin: 2rem auto;
    padding: 0 1rem;
  }
  header p { color: color-mix(in srgb, currentColor 65%, transparent); }
  form { display: grid; gap: 0.75rem; margin: 1.5rem 0 2rem; }
  label { display: block; font-weight: 600; margin-bottom: 0.25rem; }
  input, textarea {
    width: 100%;
    font: inherit;
    padding: 0.5rem;
    box-sizing: border-box;
  }
  button {
    font: inherit;
    padding: 0.5rem 1rem;
    width: fit-content;
    cursor: pointer;
  }
  ol.marks { list-style: none; margin: 0; padding: 0; display: grid; gap: 1rem; }
  .mark {
    padding: 0.75rem 1rem;
    border-left: 3px solid color-mix(in srgb, currentColor 25%, transparent);
  }
  .mark.mine { border-left-color: currentColor; }
  .mark-body { margin: 0 0 0.35rem; white-space: pre-wrap; }
  .mark-meta {
    margin: 0;
    font-size: 0.85rem;
    color: color-mix(in srgb, currentColor 65%, transparent);
  }
  .badge {
    display: inline-block;
    font-size: 0.75rem;
    border: 1px solid currentColor;
    border-radius: 1em;
    padding: 0 0.5em;
    margin-left: 0.25em;
  }
  .mark.live { animation: mark-arrive 2s ease-out; }
  @keyframes mark-arrive { from { border-left-color: currentColor; } }
  @media (prefers-reduced-motion: reduce) { .mark.live { animation: none; } }
  .empty { color: color-mix(in srgb, currentColor 65%, transparent); }
  footer { margin-top: 3rem; font-size: 0.85rem; }
</style>
</head>
<body>
${body}
</body>
</html>
`;
}

export function marksList(marks: Mark[], visitorId: string): string {
  if (marks.length === 0) {
    return `<p class="empty">No marks yet — be the first.</p>`;
  }
  const items = marks
    .map((mark) => {
      const mine = mark.visitor_id === visitorId;
      return `<li class="mark${mine ? " mine" : ""}" data-id="${mark.id}">
  <p class="mark-body">${escapeHtml(mark.body)}</p>
  <p class="mark-meta">${escapeHtml(mark.name)} · <time datetime="${mark.created_at}">${formatTime(mark.created_at)}</time>${
    mine ? ' <span class="badge">yours</span>' : ""
  }</p>
</li>`;
    })
    .join("\n");
  return `<ol class="marks">\n${items}\n</ol>`;
}

// What a live event carries: the mark as the wall shows it, with "mine"
// worked out per connection so no visitor's id ever leaves the server.
export function markEvent(mark: Mark, visitorId: string): string {
  return JSON.stringify({
    id: mark.id,
    name: mark.name,
    body: mark.body,
    createdAt: mark.created_at,
    time: formatTime(mark.created_at),
    mine: mark.visitor_id === visitorId,
  });
}

// The one script on the page: it only adds live marks to a wall that already
// works without it. Everything user-supplied goes in through textContent.
export const liveScript = `<script>
(() => {
  const main = document.querySelector("main");
  const listOf = () => main.querySelector("ol.marks");
  const top = listOf()?.querySelector(".mark[data-id]")?.dataset.id ?? "0";
  const source = new EventSource("/events?since=" + top);
  source.onmessage = (event) => {
    const mark = JSON.parse(event.data);
    if (main.querySelector('.mark[data-id="' + mark.id + '"]')) return;
    let list = listOf();
    if (!list) {
      list = document.createElement("ol");
      list.className = "marks";
      const empty = main.querySelector("p.empty");
      if (empty) empty.replaceWith(list);
      else main.append(list);
    }
    const li = document.createElement("li");
    li.className = "mark live" + (mark.mine ? " mine" : "");
    li.dataset.id = String(mark.id);
    if (mark.body) {
      const body = document.createElement("p");
      body.className = "mark-body";
      body.textContent = mark.body;
      li.append(body);
    }
    const meta = document.createElement("p");
    meta.className = "mark-meta";
    const time = document.createElement("time");
    time.dateTime = mark.createdAt;
    time.textContent = mark.time;
    meta.append(mark.name + " · ", time);
    if (mark.mine) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "yours";
      meta.append(" ", badge);
    }
    li.append(meta);
    list.prepend(li);
  };
})();
</script>`;
