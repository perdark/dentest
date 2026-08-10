// Pure DB client (no "server-only" guard) so CLI scripts (seed) can import it.
// App code should import "@/lib/db" instead, which re-exports this behind the guard.
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const dbPath = process.env.DENTEST_DB ?? path.join(process.cwd(), "dentest.db");

const globalForDb = globalThis as unknown as {
  __dentestSqlite?: Database.Database;
};

const sqlite =
  globalForDb.__dentestSqlite ??
  (() => {
    const conn = new Database(dbPath);
    conn.pragma("journal_mode = WAL");
    conn.pragma("foreign_keys = ON");
    return conn;
  })();

if (process.env.NODE_ENV !== "production") globalForDb.__dentestSqlite = sqlite;

export const db = drizzle(sqlite, { schema });
export { schema, sqlite };
