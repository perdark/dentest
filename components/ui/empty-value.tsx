/**
 * Stand-in for a value the clinic simply has not filled in.
 *
 * The app used to print an em-dash ("—") in every blank cell. On a dense
 * money table that reads as a character someone typed, or worse as a minus
 * sign next to an amount, and a screen with a dozen of them looks broken
 * rather than merely incomplete. A short, quiet word says the same thing and
 * cannot be mistaken for data.
 *
 * Blank is still right where the emptiness is self-evident (a free-text note
 * column) — this is for places where the reader would otherwise wonder whether
 * the value failed to load.
 */
export function EmptyValue({
  children = "غير مسجّل",
}: {
  children?: React.ReactNode;
}) {
  return <span className="text-muted-foreground text-sm">{children}</span>;
}

/** True for the values that should render as {@link EmptyValue}. */
export function isBlank(value: React.ReactNode): boolean {
  return value == null || value === "" || value === false;
}
