import type { Mark } from "./db.ts";
import { DRAW_HEIGHT, DRAW_WIDTH, MAX_POINTS, drawingPath, parseDrawing } from "./drawing.ts";

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
  .mark-drawing {
    display: block;
    width: 100%;
    height: auto;
    margin: 0 0 0.35rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .draw-label { font-weight: 600; margin: 0 0 0.25rem; }
  .draw canvas {
    display: block;
    width: 100%;
    box-sizing: border-box;
    aspect-ratio: ${DRAW_WIDTH} / ${DRAW_HEIGHT};
    border: 1px solid color-mix(in srgb, currentColor 40%, transparent);
    touch-action: none;
    cursor: crosshair;
  }
  .draw canvas.has-drawing { border-color: currentColor; }
  .draw-controls { display: flex; align-items: center; gap: 0.75rem; margin-top: 0.5rem; }
  .draw-status { font-size: 0.85rem; }
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
      const drawing = mark.drawing ? parseDrawing(mark.drawing) : null;
      const svg = drawing
        ? `<svg class="mark-drawing" viewBox="0 0 ${DRAW_WIDTH} ${DRAW_HEIGHT}" role="img" aria-label="Drawing by ${escapeHtml(mark.name)}"><path d="${drawingPath(drawing)}"/></svg>\n  `
        : "";
      const body = mark.body ? `<p class="mark-body">${escapeHtml(mark.body)}</p>\n  ` : "";
      return `<li class="mark${mine ? " mine" : ""}" data-id="${mark.id}">
  ${svg}${body}<p class="mark-meta">${escapeHtml(mark.name)} · <time datetime="${mark.created_at}">${formatTime(mark.created_at)}</time>${
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
    drawing: mark.drawing ? parseDrawing(mark.drawing) : null,
  });
}

// The canvas part of the posting form. It ships hidden: the page script
// reveals it, so with JavaScript off the form is exactly the text-only one.
export const drawField = `<div class="draw" role="group" aria-labelledby="draw-label" hidden>
    <p class="draw-label" id="draw-label">Or draw something</p>
    <canvas aria-label="Drawing area: draw with a mouse, finger or pen"></canvas>
    <div class="draw-controls">
      <button type="button" class="draw-clear" disabled>Clear drawing</button>
      <span class="draw-status" aria-live="polite">No drawing yet.</span>
    </div>
    <input type="hidden" name="drawing" value="">
  </div>`;

// The one script on the page. It enhances a page that already works without
// it: the canvas fills a hidden form field, and live marks are prepended to
// the wall. Everything user-supplied goes in through textContent or
// setAttribute, never innerHTML.
export const pageScript = `<script>
(() => {
  const W = ${DRAW_WIDTH}, H = ${DRAW_HEIGHT}, MAX_POINTS = ${MAX_POINTS};
  const SVG = "http://www.w3.org/2000/svg";

  const draw = document.querySelector(".draw");
  if (draw) {
    const canvas = draw.querySelector("canvas");
    const ctx = canvas.getContext("2d");
    const field = draw.querySelector('input[name="drawing"]');
    const status = draw.querySelector(".draw-status");
    const clear = draw.querySelector(".draw-clear");
    const body = document.getElementById("body");
    const strokes = [];
    let current = null, pointer = null, points = 0;
    draw.hidden = false;

    const redraw = () => {
      const scale = canvas.width / W;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.lineWidth = 4;
      ctx.lineCap = ctx.lineJoin = "round";
      ctx.strokeStyle = getComputedStyle(canvas).color;
      ctx.beginPath();
      for (const s of strokes) {
        ctx.moveTo(s[0], s[1]);
        if (s.length === 2) ctx.lineTo(s[0], s[1]);
        for (let i = 2; i < s.length; i += 2) ctx.lineTo(s[i], s[i + 1]);
      }
      ctx.stroke();
    };
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      redraw();
    };
    const update = () => {
      const has = strokes.length > 0;
      field.value = has ? JSON.stringify(strokes) : "";
      body.required = !has;
      clear.disabled = !has;
      canvas.classList.toggle("has-drawing", has);
      status.textContent = !has ? "No drawing yet."
        : points >= MAX_POINTS ? "Drawing is full. It will be included with your mark."
        : "Drawing will be included with your mark.";
    };
    // inside the border, which the bounding box includes
    const at = (e) => {
      const box = canvas.getBoundingClientRect();
      const x = Math.round(((e.clientX - box.left - canvas.clientLeft) / canvas.clientWidth) * W);
      const y = Math.round(((e.clientY - box.top - canvas.clientTop) / canvas.clientHeight) * H);
      return [Math.min(W, Math.max(0, x)), Math.min(H, Math.max(0, y))];
    };

    canvas.addEventListener("pointerdown", (e) => {
      if (pointer !== null || points >= MAX_POINTS || e.button !== 0) return;
      e.preventDefault();
      pointer = e.pointerId;
      // a failed capture shouldn't cost the stroke itself
      try { canvas.setPointerCapture(pointer); } catch {}
      current = at(e);
      strokes.push(current);
      points++;
      redraw();
    });
    canvas.addEventListener("pointermove", (e) => {
      if (e.pointerId !== pointer) return;
      const coalesced = e.getCoalescedEvents?.() ?? [];
      for (const ev of coalesced.length ? coalesced : [e]) {
        if (points >= MAX_POINTS) break;
        const [x, y] = at(ev), n = current.length;
        if (Math.hypot(x - current[n - 2], y - current[n - 1]) < 3) continue;
        current.push(x, y);
        points++;
      }
      redraw();
    });
    const end = (e) => {
      if (e.pointerId !== pointer) return;
      pointer = current = null;
      update();
    };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("lostpointercapture", end);
    clear.addEventListener("click", () => {
      strokes.length = 0;
      points = 0;
      redraw();
      update();
    });
    new ResizeObserver(resize).observe(canvas);
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redraw);
  }

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
    if (mark.drawing) {
      const svg = document.createElementNS(SVG, "svg");
      svg.setAttribute("class", "mark-drawing");
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", "Drawing by " + mark.name);
      const path = document.createElementNS(SVG, "path");
      path.setAttribute("d", mark.drawing.map((s) => {
        let d = "M" + Number(s[0]) + " " + Number(s[1]);
        if (s.length === 2) d += "l0 0";
        for (let i = 2; i < s.length; i += 2) d += "L" + Number(s[i]) + " " + Number(s[i + 1]);
        return d;
      }).join(""));
      svg.append(path);
      li.append(svg);
    }
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
