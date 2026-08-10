/**
 * Runs once when the Next.js server boots. In the packaged clinic app this is
 * the only chance to migrate + seed the database, because there is no terminal
 * to run `npm run db:setup` on the clinic laptop. [packaging]
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { ensureDatabase } = await import("./lib/db/bootstrap");
  ensureDatabase();
}
