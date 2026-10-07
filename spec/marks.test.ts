import { randomUUID } from "node:crypto";
import { expect, inject, it } from "vitest";

// The core interaction this crit is about: post a mark, it shows up, and it
// distinguishes who left it. Everything here runs against the RUNNING app
// (see spec/global-setup.ts), same as invariants.test.ts.
const baseUrl = inject("baseUrl");

async function postMark(name: string, body: string): Promise<{ setCookie: string }> {
  const res = await fetch(new URL("/", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ name, body }).toString(),
    redirect: "manual",
  });
  expect(res.status).toBe(303);
  return { setCookie: res.headers.get("set-cookie") ?? "" };
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
