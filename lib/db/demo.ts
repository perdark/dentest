/**
 * Demo dataset — a fictional three months of clinic life.
 *
 * Its purpose is TRAINING, not testing: the staff learn the system on records
 * that look like their own work, and every screen (dashboard, debts, implant
 * index, ortho, settlement) has something real-shaped to show instead of an
 * empty state. Nothing here is a real patient.
 *
 * Two rules this file must never break:
 *
 * 1. It writes ONLY through the mutations layer, exactly like the UI does. A
 *    generator that inserted rows directly would happily produce data the app
 *    itself could never create — over-paid cases, payments on cancelled cases —
 *    and the first real bug found on demo data would be a phantom.
 * 2. It is deterministic. The same seed produces the same clinic every time, so
 *    "the debts page shows the wrong total" is reproducible instead of a story.
 *
 * Removal is `wipeAllRecords()`, not a reverse of this file. See the comment
 * there for why deleting "just the demo rows" is not on offer.
 */
import { eq } from "drizzle-orm";
import { db } from "./client";
import { doctors, patients, settings, treatmentTypes } from "./schema";
import {
  addExpense,
  addLabEntry,
  createAppointment,
  createCaseWithPayment,
  createPatient,
  recordCasePayment,
  recordCashMovement,
  recordXrayFilm,
  setAppointmentStatus,
  updateCaseMeta,
  updateSettings,
} from "@/lib/mutations";
import { cashOnHand } from "@/lib/server-utils";
import { todayISO } from "@/lib/dates";

// ── deterministic randomness ────────────────────────────────────────────────
// mulberry32: tiny, seeded, and good enough to scatter dates and amounts.
function makeRandom(seed: number) {
  let a = seed;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = makeRandom(20260814);
const pick = <T,>(items: readonly T[]): T => items[Math.floor(rand() * items.length)]!;
const between = (min: number, max: number): number =>
  min + Math.floor(rand() * (max - min + 1));

/** Local YYYY-MM-DD, `days` before today. Noon avoids DST edge cases. */
function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return todayISO(d);
}

// ── fictional people ────────────────────────────────────────────────────────
/** الحالات المزمنة الظاهرة في البيانات التجريبية — مفاتيح MEDICAL_FLAGS. */
const DEMO_MEDICAL_FLAGS = [
  "diabetes",
  "hypertension",
  "heart",
  "allergy",
  "bleeding",
  "asthma",
];

const NAMES = [
  "أحمد كاظم جاسم", "زينب عادل حسن", "مصطفى جبار علي", "فاطمة جواد كريم",
  "علي حسين عبد", "مريم سامي داود", "حيدر عبد الله ناصر", "رقية حيدر محمود",
  "مرتضى صالح مهدي", "نور الهدى أحمد سعد", "يوسف خالد إبراهيم", "هبة ستار جبر",
  "عمر فاضل شاكر", "شهد نزار قيس", "كرار محمد حسن", "دعاء منذر رشيد",
  "سجاد رعد عبد الحسين", "آية رياض كامل", "أمير ناصر حميد", "تبارك علي فرحان",
  "حسن علاء الدين", "بنين سعد جليل", "باقر سعد لفتة", "زهراء وليد عباس",
  "زيد وليد الطائي", "رند عماد صبري", "ليث عماد الجبوري", "سارة ثامر عودة",
  "رسول جعفر موسى", "إسراء قاسم علوان", "منتظر هادي شمخي", "نبأ حسام الدين",
  "وسام طالب عيسى", "غفران أيوب سلمان", "محمد رضا كاظم", "أنوار خضير عباس",
  "سيف الدين مازن", "رسل عمار جودة", "علاء عبد الرزاق", "مياسة نعيم حسون",
];

const AREAS = [
  "الكرادة", "المنصور", "الجادرية", "زيونة", "الأعظمية", "الكاظمية",
  "البياع", "الدورة", "حي الجامعة", "بغداد الجديدة", "الغزالية", "السيدية",
  "الشعب", "الحرية", "أور", "الكرخ",
];

const PHONE_PREFIXES = ["0770", "0771", "0780", "0781", "0750", "0751"];

const IMPLANT_DEVICES = ["Dentium", "Osstem", "MegaGen", "Straumann", "Nobel"];

const IMPLANT_NOTES = [
  "زراعة ضرس علوي أيمن", "زراعة ضرس سفلي أيسر", "زراعتان أماميتان علوي",
  "زراعة بعد قلع جراحي", "زراعة ضرس سفلي أيمن مع تطعيم",
];

const ORTHO_NOTES = [
  "تقويم ثابت علوي وسفلي", "تقويم علوي فقط", "تقويم ثابت مع مطاطات",
  "تقويم بعد قلع ضاحكين",
];

export interface DemoResult {
  patients: number;
  cases: number;
  payments: number;
  appointments: number;
  expenses: number;
  labEntries: number;
  xrayFilms: number;
}

/** True when the database still holds no patients — a demo fill is safe. */
export function isDatabaseEmpty(): boolean {
  return db.select({ id: patients.id }).from(patients).all().length === 0;
}

export function fillDemoData(): DemoResult {
  const result: DemoResult = {
    patients: 0,
    cases: 0,
    payments: 0,
    appointments: 0,
    expenses: 0,
    labEntries: 0,
    xrayFilms: 0,
  };

  const doctorRows = db.select().from(doctors).orderBy(doctors.sortOrder).all();
  const typeRows = db.select().from(treatmentTypes).all();
  if (doctorRows.length === 0 || typeRows.length === 0) {
    throw new Error("الأطباء أو أنواع العلاج غير موجودة — شغّل التهيئة أولاً.");
  }

  const typeOf = (key: string) => {
    const t = typeRows.find((row) => row.key === key);
    if (!t) throw new Error(`نوع علاج غير معروف: ${key}`);
    return t;
  };
  const orthoDoctor = doctorRows.find((d) => d.doesOrtho) ?? doctorRows[0]!;
  // Ortho is one doctor's work; everything else is shared by the rest.
  const generalDoctors = doctorRows.filter((d) => d.id !== orthoDoctor.id);

  // ── patients ──────────────────────────────────────────────────────────────
  const patientIds: number[] = [];
  NAMES.forEach((fullName, i) => {
    // بعض المرضى بحالات مزمنة: التحذير الطبي شاشة كاملة، ولو خلت البيانات
    // التجريبية منه لبدا كأنه لا يعمل. واحد من كل خمسة تقريباً، وواحد بحالتين
    // معاً حتى تظهر الشارات متجاورة كما تظهر في العيادة.
    const flags =
      i % 5 === 0 ? [pick(DEMO_MEDICAL_FLAGS)] : i % 11 === 0 ? ["diabetes", "heart"] : [];
    patientIds.push(
      createPatient({
        fullName,
        phone: `${pick(PHONE_PREFIXES)}${between(1000000, 9999999)}`,
        // The clinic does not always have an address, and the app must look
        // normal when a field is blank — so a fifth of them have none.
        address: rand() < 0.8 ? pick(AREAS) : null,
        medicalFlags: flags,
        medicalNotes:
          flags.includes("allergy") ? "حساسية من البنسلين — تُستعمل بدائل" : null,
      }),
    );
    result.patients++;
  });

  let nextPatient = 0;
  const takePatient = (): number => patientIds[nextPatient++ % patientIds.length]!;

  // ── implant cards ─────────────────────────────────────────────────────────
  // A third are fully paid, the rest still owe — that is what makes the debts
  // page and the «كروت زراعة مفتوحة» tile show something.
  const implantType = typeOf("implant");
  for (let i = 0; i < 9; i++) {
    const openedDate = isoDaysAgo(between(5, 88));
    const listPrice = 1_500_000;
    const discount = rand() < 0.3 ? pick([50_000, 100_000, 150_000]) : 0;
    const totalPrice = listPrice - discount;
    const downPayment = pick([400_000, 500_000, 600_000, 750_000]);

    const { caseId } = createCaseWithPayment({
      patientId: takePatient(),
      doctorId: pick(generalDoctors).id,
      treatmentTypeId: implantType.id,
      openedDate,
      listPrice,
      discount,
      totalPrice,
      device: pick(IMPLANT_DEVICES),
      labCost: pick([150_000, 200_000, 250_000]),
      notes: pick(IMPLANT_NOTES),
      firstPayment: { amount: downPayment, kind: "down_payment", note: "مقدمة" },
    });
    result.cases++;
    result.payments++;

    let collected = downPayment;
    const sessions = between(1, 3);
    for (let s = 0; s < sessions; s++) {
      const remaining = totalPrice - collected;
      if (remaining <= 0) break;
      // Full settle on the last session for a third of the cards.
      const wantsFullSettle = s === sessions - 1 && rand() < 0.35;
      const amount = wantsFullSettle
        ? remaining
        : Math.min(remaining, pick([200_000, 250_000, 300_000, 400_000]));
      const paid = recordCasePayment({
        caseId,
        amount,
        kind: "session",
        paidDate: isoDaysAgo(between(1, 80)),
        note: `جلسة ${s + 1}`,
      });
      if (paid.ok) {
        collected += amount;
        result.payments++;
      }
    }
    if (collected >= totalPrice) {
      updateCaseMeta(caseId, { status: "completed" }, "implant");
    }
  }

  // ── orthodontics ──────────────────────────────────────────────────────────
  const orthoType = typeOf("ortho");
  for (let i = 0; i < 7; i++) {
    const openedDate = isoDaysAgo(between(20, 89));
    const totalPrice = pick([900_000, 1_000_000, 1_100_000, 1_250_000]);
    const downPayment = pick([200_000, 250_000, 300_000]);

    const { caseId } = createCaseWithPayment({
      patientId: takePatient(),
      doctorId: orthoDoctor.id,
      treatmentTypeId: orthoType.id,
      openedDate,
      listPrice: totalPrice,
      discount: 0,
      totalPrice,
      notes: pick(ORTHO_NOTES),
      firstPayment: { amount: downPayment, kind: "down_payment", note: "مقدمة التقويم" },
    });
    result.cases++;
    result.payments++;

    let collected = downPayment;
    const visits = between(1, 4);
    for (let v = 0; v < visits; v++) {
      const remaining = totalPrice - collected;
      if (remaining <= 0) break;
      const amount = Math.min(remaining, pick([100_000, 125_000, 150_000]));
      const paid = recordCasePayment({
        caseId,
        amount,
        kind: "session",
        paidDate: isoDaysAgo(between(1, 60)),
        note: `شدّ تقويم ${v + 1}`,
      });
      if (paid.ok) {
        collected += amount;
        result.payments++;
      }
    }

    updateCaseMeta(
      caseId,
      {
        nextAppointment: isoDaysAgo(-between(3, 25)),
        hasComplaint: i === 2,
        complaintNote: i === 2 ? "المريضة تشتكي من ألم في السلك السفلي" : null,
      },
      "ortho",
    );
  }

  // ── ordinary chair work ───────────────────────────────────────────────────
  // Mostly paid in full the same day, which is how a walk-in actually behaves.
  const ordinary = [
    { type: typeOf("filling"), price: 50_000, note: "حشوة ضرس" },
    { type: typeOf("extraction_normal"), price: 25_000, note: "قلع عادي" },
    { type: typeOf("extraction_surgical"), price: 50_000, note: "قلع جراحي" },
    { type: typeOf("cleaning"), price: 25_000, note: "تنظيف وتلميع" },
    { type: typeOf("bridge"), price: 250_000, note: "جسر ثلاثي" },
  ] as const;

  for (let i = 0; i < 48; i++) {
    const work = pick(ordinary);
    const openedDate = isoDaysAgo(between(0, 89));
    const discount = rand() < 0.15 ? pick([5_000, 10_000]) : 0;
    const totalPrice = work.price - discount;
    // A bridge is the one ordinary treatment people pay for in instalments.
    const paysInFull = work.type.key !== "bridge" || rand() < 0.4;
    const firstAmount = paysInFull ? totalPrice : pick([100_000, 150_000]);

    const { caseId } = createCaseWithPayment({
      patientId: takePatient(),
      doctorId: pick(generalDoctors).id,
      treatmentTypeId: work.type.id,
      openedDate,
      listPrice: work.price,
      discount,
      totalPrice,
      notes: work.note,
      firstPayment: { amount: firstAmount, kind: "session", note: work.note },
    });
    result.cases++;
    result.payments++;
    if (paysInFull) updateCaseMeta(caseId, { status: "completed" });
  }

  // ── X-rays ────────────────────────────────────────────────────────────────
  // بيع نقدي في لحظته: نوع الصورة، وداخل أم خارج، وسعرها — بلا مريض وبلا دَين.
  // [قرار العيادة 2026-08-25][D9]
  const films = [
    { type: typeOf("xray_panoramic"), price: 15_000 },
    { type: typeOf("xray_periapical"), price: 5_000 },
    { type: typeOf("xray_cbct"), price: 50_000 },
    { type: typeOf("xray_ceph"), price: 20_000 },
  ] as const;

  for (let i = 0; i < 26; i++) {
    // CBCT and cephalometric are the uncommon ones; a plain film is the norm.
    const film = rand() < 0.75 ? films[rand() < 0.6 ? 0 : 1]! : pick(films);
    // الأكثر داخل العيادة، وبعضها يأتي من خارجها.
    const result_ = recordXrayFilm({
      filmDate: isoDaysAgo(between(0, 89)),
      treatmentTypeId: film.type.id,
      placement: rand() < 0.8 ? "internal" : "external",
      price: film.price,
    });
    if (result_.ok) result.xrayFilms++;
  }

  // One refund, because the clinic does issue them and the settlement has to be
  // seen netting one off. [D5]
  {
    const { caseId } = createCaseWithPayment({
      patientId: takePatient(),
      doctorId: pick(generalDoctors).id,
      treatmentTypeId: typeOf("filling").id,
      openedDate: isoDaysAgo(12),
      listPrice: 50_000,
      discount: 0,
      totalPrice: 50_000,
      notes: "حشوة — استرجاع جزئي بطلب المريض",
      firstPayment: { amount: 50_000, kind: "session", note: "حشوة" },
    });
    result.cases++;
    result.payments++;
    const refunded = recordCasePayment({
      caseId,
      amount: 25_000,
      kind: "refund",
      paidDate: isoDaysAgo(10),
      note: "استرجاع جزئي بطلب المريض",
    });
    if (refunded.ok) result.payments++;
  }

  // ── appointments ──────────────────────────────────────────────────────────
  // Past days are resolved (حضر / لم يحضر); today and the coming week are still
  // booked, so the register has something to actually mark on the tour.
  for (let day = 14; day >= -7; day--) {
    const date = isoDaysAgo(day);
    const count = day === 0 ? 6 : between(2, 6);
    for (let a = 0; a < count; a++) {
      const id = createAppointment({
        patientId: takePatient(),
        doctorId: rand() < 0.85 ? pick(doctorRows).id : null,
        apptDate: date,
        note: rand() < 0.4 ? pick(["مراجعة", "ألم", "متابعة تقويم", "كشف"]) : null,
      });
      result.appointments++;
      if (day > 0) {
        setAppointmentStatus(id, rand() < 0.82 ? "came" : "no_show");
      } else if (day === 0 && a < 2) {
        setAppointmentStatus(id, "came");
      }
    }
  }

  // ── monthly running costs ─────────────────────────────────────────────────
  for (let monthsBack = 2; monthsBack >= 0; monthsBack--) {
    const base = monthsBack * 30;
    const lines: Array<[
      "food" | "water" | "dental_materials" | "dental_lab" | "installments" | "other",
      number,
      number,
      string,
    ]> = [
      ["food", base + 26, between(60_000, 90_000), "غداء العيادة"],
      ["food", base + 19, between(60_000, 90_000), "غداء العيادة"],
      ["food", base + 12, between(60_000, 90_000), "غداء العيادة"],
      ["food", base + 5, between(60_000, 90_000), "غداء العيادة"],
      ["water", base + 20, between(15_000, 25_000), "قناني ماء"],
      ["dental_materials", base + 22, between(300_000, 550_000), "مواد حشو ومخدر"],
      ["dental_materials", base + 8, between(150_000, 300_000), "قفازات وكمامات"],
      ["dental_lab", base + 15, between(400_000, 700_000), "أجور مختبر"],
      ["installments", base + 3, 500_000, "قسط جهاز الأشعة"],
      ["other", base + 10, between(75_000, 150_000), "كهرباء ومولّدة"],
    ];
    for (const [category, daysBack, amount, note] of lines) {
      if (daysBack < 0) continue;
      addExpense({ expenseDate: isoDaysAgo(daysBack), category, amount, note });
      result.expenses++;
    }
  }

  // ── lab entries (مستحقات المختبر) ─────────────────────────────────────────
  // متابعة فقط — لا تدخل حصة طبيب ولا صندوق العيادة. تُملأ هنا لأن شاشة
  // «الأطباء» بلا تسجيلات تبدو كأنها لا تعمل، والموظف يتدرّب على شاشة فارغة.
  const LAB_NAMES = ["دوبرا", "النخبة", "الرافدين", "المتحدة", "بغداد"];
  doctorRows.forEach((doc, i) => {
    db.update(doctors)
      .set({ labName: LAB_NAMES[i % LAB_NAMES.length]! })
      .where(eq(doctors.id, doc.id))
      .run();

    // ثلاثة أشهر من الحساب: فاتورة أو اثنتان كل شهر، ثم دفعة جزئية بالسالب.
    for (const monthBack of [0, 1, 2]) {
      const base = monthBack * 30;
      addLabEntry({
        doctorId: doc.id,
        branch: "fixed",
        entryDate: isoDaysAgo(base + between(4, 12)),
        amount: between(250_000, 600_000),
        note: "حساب تركيبات الشهر",
      });
      result.labEntries++;

      if ((i + monthBack) % 2 === 0) {
        addLabEntry({
          doctorId: doc.id,
          branch: "mobile",
          entryDate: isoDaysAgo(base + between(3, 10)),
          amount: between(80_000, 220_000),
          note: "أطقم متحركة",
        });
        result.labEntries++;
      }

      if (monthBack > 0) {
        addLabEntry({
          doctorId: doc.id,
          branch: "fixed",
          entryDate: isoDaysAgo(base + between(1, 3)),
          amount: -between(100_000, 300_000),
          note: "دفعة للمختبر",
        });
        result.labEntries++;
      }
    }
  });

  // ── cash movements ────────────────────────────────────────────────────────
  recordCashMovement({
    moveDate: isoDaysAgo(45),
    type: "owner_draw",
    amount: -2_000_000,
    note: "سحب المالك",
  });
  recordCashMovement({
    moveDate: isoDaysAgo(30),
    type: "reserve",
    amount: -3_000_000,
    note: "تحويل إلى الاحتياطي",
  });

  // Land the drawer on a believable balance instead of whatever the random
  // walk happened to produce, and keep it under the (unconfirmed) 5M reserve
  // threshold so the demo does not open on a warning the staff cannot explain.
  const surplus = cashOnHand() - 3_200_000;
  if (surplus > 0) {
    recordCashMovement({
      moveDate: isoDaysAgo(2),
      type: "reserve",
      amount: -surplus,
      note: "إيداع الفائض في الاحتياطي",
    });
  }

  updateSettings({ demoDataAt: Date.now() });
  return result;
}

/** Timestamp the demo data was loaded, or null when the records are real. */
export function demoDataLoadedAt(): number | null {
  return db.select().from(settings).where(eq(settings.id, 1)).get()?.demoDataAt ?? null;
}
