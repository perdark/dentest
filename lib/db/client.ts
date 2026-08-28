// Pure DB client (no "server-only" guard) so CLI scripts (seed) can import it.
// App code should import "@/lib/db" instead, which re-exports this behind the guard.
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { adoptLegacyDatabase, applyPendingRestore, databasePath } from "../paths";

// Carry a pre-rename dentest.db over to zuha.db. Must happen before the
// connection below, which would otherwise create an empty file first.
adoptLegacyDatabase();

// A restore chosen from «الإعدادات» is staged, not applied — the file cannot be
// swapped under a live connection. This is the moment it lands, before anything
// opens the database. Ordering matters: after the legacy adoption (so a restore
// wins over an old dentest.db) and before the connection.
applyPendingRestore();

const dbPath = databasePath();
// The data folder may not exist yet on a fresh install of the packaged app.
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const globalForDb = globalThis as unknown as {
  __zuhaSqlite?: Database.Database;
};

const sqlite =
  globalForDb.__zuhaSqlite ??
  (() => {
    const conn = new Database(dbPath);
    conn.pragma("journal_mode = WAL");
    conn.pragma("foreign_keys = ON");
    return conn;
  })();

if (process.env.NODE_ENV !== "production") globalForDb.__zuhaSqlite = sqlite;

export const db = drizzle(sqlite, { schema });
export { schema, sqlite };
