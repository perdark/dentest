import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signPayload, safeEqual } from "@/lib/crypto";
import { getSettings } from "@/lib/server-utils";

const COOKIE = "zuha_session";
const TTL_MS = 1000 * 60 * 60 * 12; // 12h

export async function createSession(): Promise<void> {
  const s = getSettings();
  if (!s.sessionSecret) throw new Error("session secret missing — run db:seed");
  const exp = Date.now() + TTL_MS;
  const payload = String(exp);
  const token = `${payload}.${signPayload(payload, s.sessionSecret)}`;
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(TTL_MS / 1000),
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function isAuthed(): Promise<boolean> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return false;
  const dot = raw.lastIndexOf(".");
  if (dot < 1) return false;
  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const s = getSettings();
  if (!s.sessionSecret) return false;
  const expected = signPayload(payload, s.sessionSecret);
  if (!safeEqual(sig, expected)) return false;
  const exp = Number(payload);
  return Number.isFinite(exp) && exp > Date.now();
}

/** Use at the top of every protected server layout/page. */
export async function requireAuth(): Promise<void> {
  if (!(await isAuthed())) redirect("/login");
}

// `isPinSet()` reported whether a PIN had been configured yet. Nothing asked:
// `lib/db/seed.ts` sets the default PIN on first start and `instrumentation.ts`
// runs the seed on every boot, so there is no "fresh install with no PIN" state
// for a screen to branch on. Removed 2026-09-22.
