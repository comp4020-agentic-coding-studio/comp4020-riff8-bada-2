import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";

// One SQLite file on the mounted volume: /data survives a restart or a
// redeploy, nothing else does (see fly.toml). DATA_DIR overrides it for a
// local run, where there's no volume.
const dataDir = process.env.DATA_DIR ?? "/data";
mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(`${dataDir}/marks.sqlite`);

db.exec(`
  create table if not exists marks (
    id integer primary key autoincrement,
    visitor_id text not null,
    name text not null,
    body text not null,
    created_at text not null
  )
`);

// Databases from before drawings existed get the column added in place;
// existing marks keep a null drawing.
const columns = db.prepare("pragma table_info(marks)").all() as unknown as { name: string }[];
if (!columns.some((c) => c.name === "drawing")) {
  db.exec("alter table marks add column drawing text");
}

export interface Mark {
  id: number;
  visitor_id: string;
  name: string;
  body: string;
  created_at: string;
  // validated stroke JSON (see drawing.ts), or null for a text-only mark
  drawing: string | null;
}

const insertStmt = db.prepare(
  "insert into marks (visitor_id, name, body, drawing, created_at) values (?, ?, ?, ?, ?)",
);
const listStmt = db.prepare("select * from marks order by id desc");
const getStmt = db.prepare("select * from marks where id = ?");
const listSinceStmt = db.prepare("select * from marks where id > ? order by id asc");

export function insertMark(visitorId: string, name: string, body: string, drawing: string | null): Mark {
  const { lastInsertRowid } = insertStmt.run(visitorId, name, body, drawing, new Date().toISOString());
  return getStmt.get(lastInsertRowid) as unknown as Mark;
}

// Oldest first, so a client prepending each one in turn ends up newest-on-top.
export function listMarksSince(id: number): Mark[] {
  return listSinceStmt.all(id) as unknown as Mark[];
}

export function listMarks(): Mark[] {
  return listStmt.all() as unknown as Mark[];
}
