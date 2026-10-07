import type { IncomingMessage, ServerResponse } from "node:http";
import { listMarksSince, type Mark } from "./db.ts";
import { markEvent } from "./render.ts";

const PING_MS = 25_000;

interface Connection {
  res: ServerResponse;
  visitorId: string;
}

// fly.toml pins the app to one machine, so every open stream lives in this
// process and an in-memory set is the whole broadcast mechanism.
const connections = new Set<Connection>();

function send(conn: Connection, mark: Mark): void {
  if (conn.res.writableEnded || conn.res.destroyed) return;
  conn.res.write(`id: ${mark.id}\ndata: ${markEvent(mark, conn.visitorId)}\n\n`);
}

// The id to replay after: the Last-Event-ID an EventSource sends when it
// reconnects, or, on the first connect, the newest mark the page was rendered
// with (so a mark posted between render and connect isn't lost either).
function resumeFrom(req: IncomingMessage, url: URL): number {
  const raw = req.headers["last-event-id"] ?? url.searchParams.get("since");
  const id = Number(raw);
  return typeof raw === "string" && Number.isSafeInteger(id) && id >= 0 ? id : -1;
}

export function openStream(req: IncomingMessage, res: ServerResponse, url: URL, visitorId: string): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(": connected\n\n");

  const conn: Connection = { res, visitorId };
  const after = resumeFrom(req, url);
  if (after >= 0) {
    for (const mark of listMarksSince(after)) send(conn, mark);
  }
  connections.add(conn);

  const ping = setInterval(() => res.write(": ping\n\n"), PING_MS);
  res.on("close", () => {
    clearInterval(ping);
    connections.delete(conn);
  });
}

export function broadcast(mark: Mark): void {
  for (const conn of connections) send(conn, mark);
}
