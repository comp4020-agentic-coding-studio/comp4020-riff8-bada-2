import { createServer, type IncomingMessage } from "node:http";
import { readFileSync } from "node:fs";
import { marked } from "marked";
import { getCookie, getVisitorId, setCookie } from "./cookies.ts";
import { drawField, escapeHtml, marksList, page, pageScript } from "./render.ts";
import { parseDrawing } from "./drawing.ts";
import { insertMark, listMarks } from "./db.ts";
import { broadcast, openStream } from "./live.ts";

const PORT = Number(process.env.PORT ?? 8080);
const MAX_NAME = 40;
const MAX_BODY = 280;
// room for a full drawing (see drawing.ts) once it's form-encoded
const MAX_REQUEST_BYTES = 65_536;

// `.trim()` only strips whitespace (Unicode `Zs`), not zero-width/format
// characters (`Cf`, e.g. U+200B) — a string made of nothing else survives
// `.trim()` non-empty and reads as blank on the wall.
function hasVisibleContent(s: string): boolean {
  return /[^\s\p{Cf}]/u.test(s);
}

// The body, or null if it's over MAX_REQUEST_BYTES. The rest is read and
// dropped rather than cut off, so the client gets a clean 413.
async function readBody(req: IncomingMessage): Promise<string | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size <= MAX_REQUEST_BYTES) chunks.push(chunk);
  }
  return size > MAX_REQUEST_BYTES ? null : Buffer.concat(chunks).toString("utf8");
}

function homePage(marks: ReturnType<typeof listMarks>, visitorId: string, lastName: string): string {
  return page(
    "Marks",
    `<header>
  <h1>Marks</h1>
  <p>Leave a short mark. It'll still be here when you're back — <a href="/readme/">what this is for</a>.</p>
</header>
<main>
<form method="post" action="/">
  <p>
    <label for="name">Your name</label>
    <input id="name" name="name" required maxlength="${MAX_NAME}" autocomplete="name" value="${escapeHtml(lastName)}">
  </p>
  <p>
    <label for="body">Your mark</label>
    <textarea id="body" name="body" required maxlength="${MAX_BODY}" rows="2"></textarea>
  </p>
  ${drawField}
  <button type="submit">Leave it</button>
</form>
${marksList(marks, visitorId)}
</main>
${pageScript}`,
  );
}

const server = createServer((req, res) => {
  void (async () => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const visitorId = getVisitorId(req, res);

      if (req.method === "GET" && url.pathname === "/") {
        const lastName = getCookie(req, "name") ?? "";
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(homePage(listMarks(), visitorId, lastName));
        return;
      }

      if (req.method === "POST" && url.pathname === "/") {
        const raw = await readBody(req);
        if (raw === null) {
          res.writeHead(413, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("that mark is too large");
          return;
        }
        const params = new URLSearchParams(raw);
        const name = (params.get("name") ?? "").trim().slice(0, MAX_NAME);
        const trimmed = (params.get("body") ?? "").trim().slice(0, MAX_BODY);
        const body = hasVisibleContent(trimmed) ? trimmed : "";
        // Only the canvas script fills this field, so anything that doesn't
        // parse is tampering or a bug: refuse the whole mark, don't drop the
        // drawing quietly.
        const drawingRaw = params.get("drawing") ?? "";
        const drawing = drawingRaw === "" ? null : parseDrawing(drawingRaw);
        if (drawingRaw !== "" && drawing === null) {
          res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("that drawing isn't one this wall can show");
          return;
        }
        // a mark is a name plus some text, a drawing, or both
        if (hasVisibleContent(name) && (body || drawing)) {
          broadcast(insertMark(visitorId, name, body, drawing && JSON.stringify(drawing)));
          setCookie(res, "name", name);
        }
        res.writeHead(303, { Location: "/" });
        res.end();
        return;
      }

      if (req.method === "GET" && url.pathname === "/events") {
        openStream(req, res, url, visitorId);
        return;
      }

      if (req.method === "GET" && url.pathname === "/readme/") {
        const md = readFileSync("README.md", "utf8");
        const html = await marked.parse(md);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(page("About this app", `<main>${html}</main>`));
        return;
      }

      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("not found");
    } catch (err) {
      console.error(err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      }
      res.end("something went wrong");
    }
  })();
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`listening on :${PORT}`);
});
