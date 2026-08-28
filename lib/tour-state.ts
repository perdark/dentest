"use server";
/**
 * Which guided tours this clinic has already seen.
 *
 * 🔴 This used to live in `localStorage`, and it was broken in the packaged
 * app — the one place it matters. `electron/main.js` starts the Next server
 * with `srv.listen(0, "127.0.0.1")`, i.e. **a fresh random port on every
 * launch**, and browser storage is scoped to the origin *including the port*.
 * Every launch therefore got an empty store, `seen` read false, and the
 * welcome tour opened again. It never reproduced in a browser, where the dev
 * port is fixed — which is exactly why it survived to the clinic.
 *
 * The database is in Electron's `userData` directory, so it is immune both to
 * the port changing and to anyone clearing the browser cache.
 *
 * ⚠️ Stored as a JSON array of pathnames rather than a boolean per tour: new
 * screens get tours over time, and a column per screen would mean a migration
 * each time.
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { isAuthed } from "@/lib/auth";

const ROW_ID = 1;

function parse(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    // Corrupt value: treat as "nothing seen" rather than throwing on a screen
    // the clinic is trying to open. Worst case the tour offers itself again.
    return [];
  }
}

/**
 * Pathnames whose tour has been completed.
 *
 * ⚠️ Guarded with `isAuthed()` rather than `requireAuth()`: these two are the
 * only actions in the app that are not navigations, and a `redirect()` thrown
 * out of a fire-and-forget call would surface as an unhandled rejection rather
 * than a login screen. Signed out, the honest answer is "no tours recorded".
 */
export async function seenTours(): Promise<string[]> {
  if (!(await isAuthed())) return [];
  const row = await db
    .select({ toursSeen: settings.toursSeen })
    .from(settings)
    .where(eq(settings.id, ROW_ID))
    .get();
  return parse(row?.toursSeen);
}

/**
 * Record that this screen's tour is done. Idempotent.
 *
 * ⚠️ Read-modify-write on a single-row table in a desktop app with one user —
 * there is no concurrent writer to race against. Do not copy this pattern to
 * anything a second process can touch.
 */
export async function markTourSeen(pathname: string): Promise<void> {
  // Same reasoning as `seenTours`: no write happens for a caller who is not
  // signed in, and nothing is thrown at a component that cannot handle it.
  if (!(await isAuthed())) return;
  const current = await seenTours();
  if (current.includes(pathname)) return;
  await db
    .update(settings)
    .set({ toursSeen: JSON.stringify([...current, pathname]) })
    .where(eq(settings.id, ROW_ID));
}
