/**
 * End-to-end verification of the money logic (D1–D9) against the real data
 * layer. Run with a throwaway DB:
 *   ZUHA_DB=verify.db NODE_OPTIONS=--conditions=react-server tsx scripts/verify.ts
 */
import { eq, and, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { auditLog, monthlySettlements } from "@/lib/db/schema";
import {
  listDoctors,
  listTreatmentTypes,
  caseWithDetails,
  debtsList,
  dashboardStats,
} from "@/lib/queries";
import {
  createCaseWithPayment,
  recordCasePayment,
  addExpense,
  createPatient,
  recordXrayFilm,
} from "@/lib/mutations";
import { computeSettlement, closeSettlement } from "@/lib/settlement";
import { cashOnHand } from "@/lib/server-utils";
import { currentPeriod, todayISO } from "@/lib/dates";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log("  ✓", name);
  } else {
    fail++;
    console.log("  ✗ FAIL:", name, extra);
  }
}

const today = todayISO();
const period = currentPeriod();

const docs = listDoctors();
const adi = docs.find((d) => d.isOwner)!;
const zahra = docs.find((d) => d.doesOrtho)!;
const types = listTreatmentTypes();
const implant = types.find((t) => t.isImplant)!;
const ortho = types.find((t) => t.isOrtho)!;
const extraction = types.find((t) => t.key === "extraction_normal")!;

console.log("\n— Setup —");
check("seed: 4 doctors", docs.length === 4);
check("seed: owner is Adi", adi.name.includes("عدي"));
check(
  "seed: every commission % is UNCONFIRMED (null) so the badge shows [C1]",
  docs.every((d) => d.commissionPct === null),
  `got ${docs.map((d) => d.commissionPct).join(",")}`,
);
check("seed: ortho doctor is Zahra", zahra.name.includes("زهرة"));

// 1) Implant case (Adi): total 2,000,000, down payment 500,000
const imp = createCaseWithPayment({
  patientId: needPatient("مريض الزراعة", "07700000001"),
  doctorId: adi.id,
  treatmentTypeId: implant.id,
  openedDate: today,
  listPrice: 2_000_000,
  discount: 0,
  totalPrice: 2_000_000,
  firstPayment: { amount: 500_000, kind: "down_payment" },
});
const impCase = caseWithDetails(imp.caseId)!;
check("implant: card no allocated", impCase.implantCardNo === 1, `got ${impCase.implantCardNo}`);
check("implant: account seq allocated", impCase.accountSeqNo === 1, `got ${impCase.accountSeqNo}`);
check("implant: paid=500k remaining=1.5M", impCase.paid === 500_000 && impCase.remaining === 1_500_000, `paid=${impCase.paid} rem=${impCase.remaining}`);

// session payment 300,000
needPayment({ caseId: imp.caseId, amount: 300_000, kind: "session", paidDate: today });
// refund 100,000 — reduces cash, restores the balance, AND nets out of the
// doctor's commissionable base so no commission is paid on returned money [A2]
needPayment({ caseId: imp.caseId, amount: 100_000, kind: "refund", paidDate: today });
const impCase2 = caseWithDetails(imp.caseId)!;
check("implant after session+refund: paid=700k", impCase2.paid === 700_000, `paid=${impCase2.paid}`);
check("implant remaining restored by refund: 1.3M", impCase2.remaining === 1_300_000, `rem=${impCase2.remaining}`);

// 2) Walk-in extraction (Adi): 50,000 full
createCaseWithPayment({
  patientId: needPatient("مريض القلع", "07700000002"),
  doctorId: adi.id,
  treatmentTypeId: extraction.id,
  openedDate: today,
  listPrice: 50_000,
  discount: 0,
  totalPrice: 50_000,
  firstPayment: { amount: 50_000, kind: "down_payment" },
});

// 3) Ortho case (Zahra): open-ended — down 200,000, no agreed total.
// التقويم بلا إجمالي (2026-08-19): الحالة تُفتح بإجمالي صفر ثم تُسعَّر كل جلسة
// عند إضافتها، تماماً كما يفعل `createOrthoCase`. مالها يبقى نقداً محصَّلاً في
// الحصيلة، ولا يصير رصيداً على المريض في أي شاشة.
const orthoCase = createCaseWithPayment({
  patientId: needPatient("مريض التقويم", "07700000003"),
  doctorId: zahra.id,
  treatmentTypeId: ortho.id,
  openedDate: today,
  listPrice: 0,
  discount: 0,
  totalPrice: 0,
  firstPayment: { amount: 200_000, kind: "down_payment" },
});
check(
  "ortho: opened with no agreed total, down payment accepted [2026-08-19]",
  caseWithDetails(orthoCase.caseId)!.paid === 200_000,
  `paid=${caseWithDetails(orthoCase.caseId)!.paid}`,
);
// جلسة بمبلغها الخاص: لا سقف «متبقٍ» يرفضها.
needPayment({
  caseId: orthoCase.caseId,
  amount: 150_000,
  kind: "session",
  paidDate: today,
  expectedCourse: "ortho",
});
check(
  "ortho: a per-session amount is accepted with no remaining balance [2026-08-19]",
  caseWithDetails(orthoCase.caseId)!.paid === 350_000,
  `paid=${caseWithDetails(orthoCase.caseId)!.paid}`,
);

// 4) One 15,000 X-ray film — no patient, no doctor. Clinic income: it must move
// cash and clinic net, and must leave every figure Adi is paid on untouched. [D9]
const xrayType = types.find((t) => t.settlementBucket === "xray")!;
const xray = recordXrayFilm({
  filmDate: today,
  treatmentTypeId: xrayType.id,
  placement: "internal",
  price: 15_000,
});
check("xray: recorded through the X-ray register [D9]", xray.ok === true);
check(
  "xray: dental work is refused by the X-ray register [D9]",
  recordXrayFilm({
    filmDate: today,
    treatmentTypeId: extraction.id,
    placement: "internal",
    price: 50_000,
  }).ok === false,
);

// 5) Expenses: lab 120k + food 30k
addExpense({ expenseDate: today, category: "dental_lab", amount: 120_000 });
addExpense({ expenseDate: today, category: "food", amount: 30_000 });

console.log("\n— Settlement (D1/D3/D6/D7) —");
const st = computeSettlement(period);
const adiS = st.doctors.find((d) => d.doctorId === adi.id)!;
const zahraS = st.doctors.find((d) => d.doctorId === zahra.id)!;
check("Adi collected implant = 700k (refund netted) [A2]", adiS.collectedImplant === 700_000, `got ${adiS.collectedImplant}`);
check("Adi collected normal = 50k", adiS.collectedNormal === 50_000, `got ${adiS.collectedNormal}`);
check("Adi collectedTotal = 750k", adiS.collectedTotal === 750_000, `got ${adiS.collectedTotal}`);
check("Adi accrued (work-done) = 2.05M [D1]", adiS.accruedTotal === 2_050_000, `got ${adiS.accruedTotal}`);
// % is unconfirmed → falls back to settings.defaultCommissionPct (50). [C1]
check("Adi falls back to the default 50%", adiS.commissionPct === 50, `got ${adiS.commissionPct}`);
check("Adi payout = 375k (×50%, lab NOT deducted) [D6]", adiS.payout === 375_000, `got ${adiS.payout}`);
check("no shortfall while lab is a clinic expense [A6]", adiS.shortfall === 0, `got ${adiS.shortfall}`);
check("collectedTotal matches net cash from Adi's cases [A7]", adiS.collectedTotal === 750_000);
check("Zahra collected ortho = 350k (down + session)", zahraS.collectedOrtho === 350_000, `got ${zahraS.collectedOrtho}`);
check("Zahra payout = 175k (×50%) [D3]", zahraS.payout === 175_000, `got ${zahraS.payout}`);
check("clinic net = collected + أشعة − payouts − expenses [D7][D9]", st.clinicNet === st.totalCollected + st.xrayIncome - st.totalPayout - st.monthExpenses, `net=${st.clinicNet}`);

console.log("\n— X-ray income is the clinic's (D9) —");
// A 15k film was taken this month. None of it may appear in what any doctor is
// paid on: Adi's collectedTotal stays 750k and accrued stays 2.05M.
check("xray money is NOT in Adi's collected total", adiS.collectedTotal === 750_000, `got ${adiS.collectedTotal}`);
check("xray work is NOT in Adi's work-done total", adiS.accruedTotal === 2_050_000, `got ${adiS.accruedTotal}`);
check("xray money is NOT in Adi's payout", adiS.payout === 375_000, `got ${adiS.payout}`);
check("xray income reported separately = 15k", st.xrayIncome === 15_000, `got ${st.xrayIncome}`);
check(
  "no doctor bucket carries the xray",
  st.doctors.every((d) => d.collectedImplant + d.collectedOrtho + d.collectedNormal === d.collectedTotal),
);

console.log("\n— Ortho is never a patient debt (2026-08-19) —");
// المال المحصَّل من التقويم يدخل الحصيلة والنقد كاملاً (فوق)، لكن لا رصيد
// مطلوباً منه: لا يوجد إجمالي متفق عليه ليُطرح منه المدفوع.
check(
  "ortho case is not in the debts call-list",
  !debtsList().some((r) => r.id === orthoCase.caseId),
);
// A second check here asserted the same exclusion for `openCasesBrief()`, the
// daily payment picker's query. 1923cc0 deleted that picker and 2026-09-22
// deleted the query, so the check was reporting green on a screen that no
// longer existed. «الديون» above is now the only list a balance appears in.
// المتبقي المعروض في لوحة التحكم = زراعة عدي وحدها (2M − 700k = 1.3M).
check(
  "dashboard outstanding counts the implant only, not ortho",
  dashboardStats().outstanding === 1_300_000,
  `got ${dashboardStats().outstanding}`,
);

console.log("\n— Cash on hand (D8) —");
// opening 0 + payments(500k+300k-100k+50k+200k+150k=1,100k) + films(15k)
// − expenses(150k) = 965k. الفيلم لا سطر دفعة له، فلولا جمعه هنا لنقص الدرج. [D8][D9]
check("cashOnHand = 965k (xray cash included) [D8][D9]", cashOnHand() === 965_000, `got ${cashOnHand()}`);

console.log("\n— Close month + closed-period edit (D3/D4) —");
closeSettlement(period);
const closedRow = db.select().from(monthlySettlements).where(and(eq(monthlySettlements.period, period), eq(monthlySettlements.doctorId, adi.id))).get();
check("settlement row closed + snapshot saved", closedRow?.status === "closed" && !!closedRow?.snapshotJson);
check("snapshot froze Adi payout = 375k", closedRow?.payout === 375_000, `got ${closedRow?.payout}`);

// Edit inside the closed month → must mark stale + audit-flag
needPayment({ caseId: imp.caseId, amount: 100_000, kind: "session", paidDate: today });
const st2 = computeSettlement(period);
const adiS2 = st2.doctors.find((d) => d.doctorId === adi.id)!;
check("closed-month edit → settlement marked stale [D4]", adiS2.status === "stale", `got ${adiS2.status}`);
const lastAudit = db.select().from(auditLog).where(eq(auditLog.entity, "payments")).orderBy(desc(auditLog.id)).get();
check("closed-period edit audit-flagged [D4]", lastAudit?.hitClosedPeriod === true);

console.log(`\n=== VERIFY: ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);

// helper: create a patient inline (verification only)
function needPatient(name: string, phone: string): number {
  // use the mutation layer to keep audit consistent
  return createPatient({ fullName: name, phone });
}

function needPayment(input: Parameters<typeof recordCasePayment>[0]): number {
  const result = recordCasePayment(input);
  if (!result.ok) throw new Error(`payment rejected: ${result.reason}`);
  return result.paymentId;
}
