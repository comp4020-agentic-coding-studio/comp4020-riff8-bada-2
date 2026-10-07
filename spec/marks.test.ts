import { randomUUID } from "node:crypto";
import { expect, inject, it } from "vitest";

// The core interaction this crit is about: post a mark, it shows up, and it
// distinguishes who left it. Everything here runs against the RUNNING app
// (see spec/global-setup.ts), same as invariants.test.ts.
const baseUrl = inject("baseUrl");

function post(fields: Record<string, string>): Promise<Response> {
  return fetch(new URL("/", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
    redirect: "manual",
  });
}

async function postMark(name: string, body: string, drawing?: string): Promise<{ setCookie: string }> {
  const res = await post(drawing === undefined ? { name, body } : { name, body, drawing });
  expect(res.status).toBe(303);
  return { setCookie: res.headers.get("set-cookie") ?? "" };
}

async function wall(): Promise<string> {
  return (await fetch(new URL("/", baseUrl))).text();
}

it("a posted mark shows up on the wall", async () => {
  const marker = `mark-${randomUUID()}`;
  await postMark("Test Visitor", marker);
  const res = await fetch(new URL("/", baseUrl));
  expect(res.status).toBe(200);
  expect(await res.text()).toContain(marker);
});

it("rejects a mark with an empty body without storing it", async () => {
  const marker = `empty-${randomUUID()}`;
  await postMark(marker, "");
  const res = await fetch(new URL("/", baseUrl));
  expect(await res.text()).not.toContain(marker);
});

it("rejects a name made only of zero-width characters", async () => {
  const marker = `zwsp-${randomUUID()}`;
  await postMark("​​​", marker);
  const res = await fetch(new URL("/", baseUrl));
  expect(await res.text()).not.toContain(marker);
});

it("accepts a name that merely contains a zero-width character", async () => {
  const marker = `zwsp-ok-${randomUUID()}`;
  await postMark(`Jo​hn`, marker);
  const res = await fetch(new URL("/", baseUrl));
  expect(await res.text()).toContain(marker);
});

it("still serves the page when a cookie value is malformed percent-encoding", async () => {
  const res = await fetch(new URL("/", baseUrl), {
    headers: { Cookie: "visitor=%" },
  });
  expect(res.status).toBe(200);
});

it("issues a fresh visitor cookie per anonymous request", async () => {
  const a = await postMark("A", `a-${randomUUID()}`);
  const b = await postMark("B", `b-${randomUUID()}`);
  expect(a.setCookie).toMatch(/^visitor=/);
  expect(b.setCookie).toMatch(/^visitor=/);
  expect(a.setCookie).not.toBe(b.setCookie);
});

// Opens /events and resolves with everything read once `marker` shows up, or
// rejects after `ms`. The stream is aborted either way so Vitest can exit.
async function streamUntil(marker: string, ms: number, headers: Record<string, string> = {}): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  let seen = "";
  try {
    const res = await fetch(new URL("/events", baseUrl), { headers, signal: controller.signal });
    expect(res.headers.get("content-type")).toMatch(/^text\/event-stream/);
    const decoder = new TextDecoder();
    for await (const chunk of res.body as AsyncIterable<Uint8Array>) {
      seen += decoder.decode(chunk, { stream: true });
      if (seen.includes(marker)) return seen;
    }
    throw new Error("stream ended before the marker arrived");
  } catch (err) {
    if (controller.signal.aborted) throw new Error(`no ${marker} within ${ms} ms; saw: ${seen}`);
    throw err;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

async function idOf(marker: string): Promise<number> {
  const html = await (await fetch(new URL("/", baseUrl))).text();
  const match = html.match(new RegExp(`data-id="(\\d+)">\\s*(?:<svg[^]*?</svg>\\s*)?<p class="mark-body">${marker}`));
  expect(match, `no mark with body ${marker} on the wall`).not.toBeNull();
  return Number(match![1]);
}

it("delivers a posted mark to an open stream within 1.5 s", async () => {
  const marker = `live-${randomUUID()}`;
  const arrived = streamUntil(marker, 1500);
  // give the stream a moment to register before posting
  await new Promise((resolve) => setTimeout(resolve, 100));
  await postMark("Live Visitor", marker);
  const seen = await arrived;
  expect(seen).toMatch(new RegExp(`id: \\d+\\ndata: .*${marker}`));
});

it("replays marks newer than Last-Event-ID on reconnect", async () => {
  const marker = `replay-${randomUUID()}`;
  await postMark("Away Visitor", marker);
  const id = await idOf(marker);
  const seen = await streamUntil(marker, 1500, { "Last-Event-ID": String(id - 1) });
  expect(seen).toContain(`id: ${id}\n`);
});

it("stores a drawing with its mark and renders it as an SVG path", async () => {
  const marker = `drawing-${randomUUID()}`;
  await postMark("Sketcher", marker, JSON.stringify([[10, 20, 30, 40, 50, 60], [100, 100]]));
  const html = await wall();
  const item = html.match(new RegExp(`<li[^>]*>\\s*(<svg[^]*?</svg>)\\s*<p class="mark-body">${marker}`));
  expect(item, "drawing not rendered with its mark").not.toBeNull();
  expect(item![1]).toContain('<path d="M10 20L30 40L50 60M100 100l0 0"/>');
});

it("accepts a drawing with no text and sends it live", async () => {
  // short enough to survive the 40-character name limit intact
  const marker = `drawer-${randomUUID().slice(0, 8)}`;
  const arrived = streamUntil(marker, 1500);
  await new Promise((resolve) => setTimeout(resolve, 100));
  await postMark(marker, "", JSON.stringify([[5, 5, 6, 6]]));
  expect(await arrived).toContain('"drawing":[[5,5,6,6]]');
  expect(await wall()).toMatch(new RegExp(`aria-label="Drawing by ${marker}"`));
});

it.each([
  ["not JSON", "<svg onload=alert(1)>"],
  ["not an array of strokes", JSON.stringify({ d: "M0 0" })],
  ["a string coordinate", JSON.stringify([["10", 10]])],
  ["a fractional coordinate", JSON.stringify([[10.5, 10]])],
  ["a coordinate off the grid", JSON.stringify([[601, 10]])],
  ["an odd-length stroke", JSON.stringify([[10, 10, 20]])],
  ["too many points", JSON.stringify([Array.from({ length: 3002 }, () => 1)])],
])("rejects a drawing that is %s, storing nothing", async (_, drawing) => {
  const marker = `bad-${randomUUID()}`;
  const res = await post({ name: "Tamperer", body: marker, drawing });
  expect(res.status).toBe(400);
  expect(await wall()).not.toContain(marker);
});

it("rejects an oversized request, storing nothing", async () => {
  const marker = `huge-${randomUUID()}`;
  const res = await post({ name: "Tamperer", body: marker, drawing: "[".repeat(70_000) });
  expect(res.status).toBe(413);
  expect(await wall()).not.toContain(marker);
});

it("still rejects a mark with neither text nor a drawing", async () => {
  const marker = `blank-${randomUUID()}`;
  await postMark(marker, "   ", "");
  expect(await wall()).not.toContain(marker);
});
