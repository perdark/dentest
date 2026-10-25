import assert from "node:assert/strict";
import { test } from "node:test";
import { isExplicitZero, parseAmount } from "@/lib/format";

// A free session is recorded only when zero was actually typed: `parseAmount`
// answers 0 for anything unreadable, and that must stay a refusal. [2026-10-22]
test("isExplicitZero accepts typed zero only", () => {
  for (const s of ["0", " 0 ", "00", "٠", "0 د.ع", "۰"]) assert.equal(isExplicitZero(s), true, s);
  for (const s of ["", "abc", "-0x", "0.5", "50", null, undefined]) {
    assert.equal(isExplicitZero(s as string | null | undefined), false, String(s));
  }
});

test("parseAmount reads Arabic-Indic digits", () => {
  assert.equal(parseAmount("٥٠٬٠٠٠"), 50_000);
  assert.equal(parseAmount("۷۵,۰۰۰"), 75_000);
  assert.equal(parseAmount("50,000"), 50_000);
});
