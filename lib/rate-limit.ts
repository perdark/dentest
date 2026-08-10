import "server-only";

/**
 * In-memory lockout for the shared clinic PIN. [E1]
 *
 * The PIN is four digits — only 10,000 combinations — and `next start` listens
 * on the LAN, so an unthrottled login is brute-forceable from any phone on the
 * clinic wifi in minutes. State is per-process, which is correct here: this is
 * one Next.js process on one laptop. Restarting the app clears the lockout,
 * which is acceptable — an attacker cannot restart it, and the clinic can.
 */

const MAX_ATTEMPTS = 5; // failures allowed before the first lockout
const BASE_LOCK_MS = 30_000; // first lockout
const MAX_LOCK_MS = 15 * 60_000; // ceiling

interface LoginGate {
  failures: number;
  lockedUntil: number;
}

const globalForGate = globalThis as unknown as { __dentestLoginGate?: LoginGate };

const gate: LoginGate =
  globalForGate.__dentestLoginGate ?? { failures: 0, lockedUntil: 0 };
globalForGate.__dentestLoginGate = gate;

/** Seconds remaining on the current lockout, or 0 when login is allowed. */
export function lockoutRemainingSeconds(now = Date.now()): number {
  if (gate.lockedUntil <= now) return 0;
  return Math.ceil((gate.lockedUntil - now) / 1000);
}

/** Record a wrong PIN; returns the lockout seconds now in force (0 if none). */
export function registerFailedLogin(now = Date.now()): number {
  gate.failures += 1;
  if (gate.failures >= MAX_ATTEMPTS) {
    const over = gate.failures - MAX_ATTEMPTS;
    const wait = Math.min(MAX_LOCK_MS, BASE_LOCK_MS * 2 ** over);
    gate.lockedUntil = now + wait;
  }
  return lockoutRemainingSeconds(now);
}

/** Clear the counter after a correct PIN. */
export function resetLoginAttempts(): void {
  gate.failures = 0;
  gate.lockedUntil = 0;
}

/** Attempts left before the next lockout (0 once locked). */
export function attemptsRemaining(): number {
  return Math.max(0, MAX_ATTEMPTS - gate.failures);
}
