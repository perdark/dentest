"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { backupsDir, databasePath, pendingRestorePath } from "@/lib/paths";
import { updateSettings, updateDoctor } from "@/lib/mutations";
import { getSettings } from "@/lib/server-utils";
import { verifyPin, hashPin } from "@/lib/crypto";
import { parseAmount } from "@/lib/format";
import { sqlite } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

/** Re-render everything that reads settings. */
function revalidateSettings(): void {
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/cash");
  revalidatePath("/settlement");
}

// كل نماذج الإعدادات تُعيد حالة صريحة — لا يجوز أن يبدو الحفظ ناجحاً
// بينما رُفض الإدخال بصمت. [D1]
export type SettingsState = { ok?: boolean; error?: string };

// ── العيادة: الاسم + الرصيد النقدي الافتتاحي ─────────────────────────────────
export async function updateGeneral(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  await requireAuth();
  const parsed = z
    .object({
      clinicName: z.string().trim().min(1, "اسم العيادة مطلوب"),
      openingCashBalance: z.string(),
    })
    .safeParse({
      clinicName: String(formData.get("clinicName") ?? ""),
      openingCashBalance: String(formData.get("openingCashBalance") ?? ""),
    });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "تحقّق من البيانات المُدخلة" };
  }
  updateSettings({
    clinicName: parsed.data.clinicName,
    // Money = integer dinars, parsed server-side, never negative.
    openingCashBalance: Math.max(0, parseAmount(parsed.data.openingCashBalance)),
  });
  revalidateSettings();
  return { ok: true };
}

// ── إعدادات الحساب (أرقام غير مؤكدة) ─────────────────────────────────────────
export async function updateAccounting(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  await requireAuth();
  const parsed = z
    .object({
      cashReserveThreshold: z.string(),
      defaultCommissionPct: z.coerce
        .number()
        .int()
        .min(0, "النسبة بين 0 و 100")
        .max(100, "النسبة بين 0 و 100"),
      staffSalaryMode: z.string().trim().min(1, "أدخل طريقة احتساب الرواتب"),
    })
    .safeParse({
      cashReserveThreshold: String(formData.get("cashReserveThreshold") ?? ""),
      defaultCommissionPct: String(formData.get("defaultCommissionPct") ?? "0"),
      staffSalaryMode: String(formData.get("staffSalaryMode") ?? ""),
    });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "تحقّق من البيانات المُدخلة" };
  }
  // المفاتيح: العنصر المخفي يُرسل قيمة فقط عند التفعيل. نقبل أي قيمة غير فارغة
  // حتى لا يعتمد الحفظ على كون القيمة حرفياً "on".
  const switchOn = (name: string) => {
    const v = formData.get(name);
    return typeof v === "string" && v !== "" && v !== "off" && v !== "false";
  };
  updateSettings({
    cashReserveThreshold: Math.max(0, parseAmount(parsed.data.cashReserveThreshold)),
    defaultCommissionPct: parsed.data.defaultCommissionPct,
    labDeductedPerDoctor: switchOn("labDeductedPerDoctor"),
    pctAppliedAfterLab: switchOn("pctAppliedAfterLab"),
    staffSalaryMode: parsed.data.staffSalaryMode,
  });
  revalidateSettings();
  return { ok: true };
}

// ── نِسَب الأطباء: نسبة طبيب واحد لكل نموذج ───────────────────────────────────
export async function updateDoctorPct(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  await requireAuth();
  const parsed = z
    .object({
      doctorId: z.coerce.number().int().positive(),
      commissionPct: z.string(),
    })
    .safeParse({
      doctorId: formData.get("doctorId"),
      commissionPct: String(formData.get("commissionPct") ?? ""),
    });
  if (!parsed.success) return { error: "طبيب غير صالح" };

  const raw = parsed.data.commissionPct.trim();
  // Empty = UNCONFIRMED → store NULL so the «غير مؤكد» badge returns. [C1]
  let commissionPct: number | null = null;
  if (raw !== "") {
    const n = Number(raw.replace(/[٬,\s]/g, ""));
    if (!Number.isFinite(n)) return { error: "أدخل نسبة رقمية بين 0 و 100" };
    commissionPct = Math.max(0, Math.min(100, Math.round(n)));
  }

  // طبيب غير مُفعَّل يختفي من قوائم الاختيار لكن تبقى حالاته وحصصه كما هي. [B5]
  const isActive = formData.get("isActive") != null;

  updateDoctor(parsed.data.doctorId, { commissionPct, isActive });
  revalidateSettings();
  revalidatePath("/daily");
  revalidatePath("/appointments");
  return { ok: true };
}

// ── رمز الدخول ───────────────────────────────────────────────────────────────
export type PinState = { error?: string; ok?: boolean };

export async function changePin(_prev: PinState, formData: FormData): Promise<PinState> {
  await requireAuth();
  const parsed = z
    .object({
      oldPin: z.string().min(1),
      newPin: z.string().regex(/^\d{4,}$/, "الرمز الجديد أرقام فقط، 4 على الأقل."),
      confirmPin: z.string().min(1),
    })
    .safeParse({
      oldPin: String(formData.get("oldPin") ?? "").trim(),
      newPin: String(formData.get("newPin") ?? "").trim(),
      confirmPin: String(formData.get("confirmPin") ?? "").trim(),
    });
  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ??
        "أدخل الرمز الحالي ورمزاً جديداً لا يقل عن 4 أرقام.",
    };
  }
  // خطأ مطبعي في الرمز الجديد يعني فقدان الوصول للنظام كلّه — لذلك التأكيد
  // إلزامي قبل الكتابة. [E2]
  if (parsed.data.newPin !== parsed.data.confirmPin) {
    return { error: "الرمز الجديد وتأكيده غير متطابقين." };
  }
  const s = getSettings();
  if (!verifyPin(parsed.data.oldPin, s.pinHash)) {
    return { error: "الرمز الحالي غير صحيح." };
  }
  // Never log the PIN; updateSettings strips pinHash from the audit entry.
  updateSettings({ pinHash: hashPin(parsed.data.newPin) });
  revalidateSettings();
  return { ok: true };
}

// ── النسخ الاحتياطي ──────────────────────────────────────────────────────────
export type BackupState = { ok: true; file: string } | { ok: false; error: string };
export type BackupFile = { name: string; size: number; mtime: number };

export async function backupDb(): Promise<BackupState> {
  await requireAuth();
  try {
    const dir = backupsDir();
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = path.join(dir, `zuha-${stamp}.db`);
    await sqlite.backup(file);
    revalidateSettings();
    return { ok: true, file };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "تعذّر إنشاء النسخة الاحتياطية.",
    };
  }
}

export type DemoState = { ok?: boolean; error?: string; message?: string };

/**
 * Delete every record and start clean. Keeps doctors, prices, settings, PIN.
 * Requires the word «حذف» typed by hand — this is not undoable from inside the
 * app, and a mis-click here costs the clinic its history.
 */
export async function wipeRecords(
  _prev: DemoState,
  formData: FormData,
): Promise<DemoState> {
  await requireAuth();
  if (String(formData.get("confirm") ?? "").trim() !== "حذف") {
    return { error: "اكتب كلمة «حذف» للتأكيد." };
  }
  try {
    const { wipeAllRecords } = await import("@/lib/mutations");
    const removed = wipeAllRecords("مسح كل السجلات من صفحة الإعدادات");
    revalidateAll();
    return {
      ok: true,
      message: `تم حذف ${removed.patients} مريض و${removed.payments} دفعة. الأطباء والأسعار ورمز الدخول لم تتغيّر.`,
    };
  } catch (e) {
    // 🔴 كان يُعيد `e.message` مباشرة، فظهرت رسالة قاعدة بيانات بالإنجليزية
    // («FOREIGN KEY constraint failed») على شاشة عربية لا تملك ما تفعله بها.
    // التفصيل التقني يبقى في سجل الخادم، والعيادة تقرأ جملة مفهومة. [2026-08-28]
    console.error("wipeRecords failed:", e);
    return { error: "تعذّر مسح السجلات. لم يُحذف شيء — أعد المحاولة أو راجع الدعم." };
  }
}

/** A fill or a wipe changes every screen, so every screen must be re-rendered. */
function revalidateAll(): void {
  for (const p of [
    "/dashboard",
    "/appointments",
    "/daily",
    "/patients",
    "/implants",
    "/ortho",
    "/debts",
    "/expenses",
    "/cash",
    "/settlement",
    "/audit",
    "/settings",
  ]) {
    revalidatePath(p);
  }
}

// ── الاستعادة ────────────────────────────────────────────────────────────────
export type RestoreState = { ok?: boolean; error?: string; message?: string };

/** Backups are named by `backupDb`; nothing else is a candidate for restoring. */
const BACKUP_NAME = /^zuha-[0-9TZ.-]+\.db$/;

/**
 * Stage a saved backup to replace the live database on the next start.
 *
 * 🔴 Deliberately does NOT restore in place. `better-sqlite3` holds the file
 * open for as long as the server runs, so overwriting it now would leave every
 * screen reading a file that no longer exists — and WAL would replay the old
 * rows on top of the restored ones. The file is copied to a pending slot and
 * `applyPendingRestore()` swaps it in before the next connection opens.
 *
 * Three guards, in order, because this is the one button that can destroy a
 * clinic's records:
 *   1. the name must be one `backupDb` wrote, and must be a bare filename —
 *      a path is never joined blindly onto the backups folder;
 *   2. the file is opened read-only and checked for the tables the app needs,
 *      so a truncated or unrelated file is refused instead of booting an app
 *      with no records;
 *   3. the CURRENT database is backed up first, so choosing the wrong file is
 *      undoable by restoring the safety copy.
 */
export async function restoreBackup(
  _prev: RestoreState,
  formData: FormData,
): Promise<RestoreState> {
  await requireAuth();

  const name = String(formData.get("name") ?? "").trim();
  if (String(formData.get("confirm") ?? "").trim() !== "استعادة") {
    return { error: "اكتب كلمة «استعادة» للتأكيد." };
  }
  // [1] A bare, known-shaped filename — never a path.
  if (!name || name !== path.basename(name) || !BACKUP_NAME.test(name)) {
    return { error: "اسم النسخة غير صالح." };
  }
  const source = path.join(backupsDir(), name);
  if (!fs.existsSync(source)) {
    return { error: "النسخة غير موجودة. حدّث الصفحة وجرّب مرة أخرى." };
  }

  // [2] Refuse anything that is not a Zuha database.
  const missing = missingTables(source);
  if (missing === null) {
    return { error: "الملف ليس قاعدة بيانات سليمة — لن تُستعمل." };
  }
  if (missing.length > 0) {
    return {
      error: `النسخة ناقصة (${missing.join("، ")}) — لن تُستعمل حفاظاً على سجلاتك.`,
    };
  }

  try {
    // [3] The current records, before anything is staged.
    const safety = await backupDb();
    if (!safety.ok) {
      return { error: "تعذّر حفظ نسخة من السجلات الحالية، فأُلغيت الاستعادة." };
    }
    fs.copyFileSync(source, pendingRestorePath());
    revalidateSettings();
    return {
      ok: true,
      message:
        `ستُستعاد النسخة «${name}» عند تشغيل البرنامج القادم. ` +
        `أغلق البرنامج الآن وافتحه من جديد. ` +
        `سجلاتك الحالية محفوظة في «${path.basename(safety.file)}» إن أردت التراجع.`,
    };
  } catch (e) {
    console.error("restoreBackup failed:", e);
    return { error: "تعذّر تجهيز الاستعادة. لم يتغيّر شيء في سجلاتك." };
  }
}

/** Cancel a staged restore that has not been applied yet. */
export async function cancelRestore(): Promise<RestoreState> {
  await requireAuth();
  const pending = pendingRestorePath();
  if (!fs.existsSync(pending)) return { ok: true, message: "لا توجد استعادة معلّقة." };
  try {
    fs.rmSync(pending);
    revalidateSettings();
    return { ok: true, message: "أُلغيت الاستعادة. سيفتح البرنامج على سجلاتك الحالية." };
  } catch (e) {
    console.error("cancelRestore failed:", e);
    return { error: "تعذّر إلغاء الاستعادة." };
  }
}

/** Is a restore waiting for the next start? Read helper for the Settings page. */
export async function pendingRestore(): Promise<string | null> {
  await requireAuth();
  const pending = pendingRestorePath();
  return fs.existsSync(pending) ? path.basename(databasePath()) : null;
}

/**
 * Tables the app cannot run without. Returns the missing ones, or `null` when
 * the file will not open as a database at all.
 */
function missingTables(file: string): string[] | null {
  const REQUIRED = ["settings", "doctors", "patients", "cases", "payments"];
  let conn: Database.Database | null = null;
  try {
    conn = new Database(file, { readonly: true, fileMustExist: true });
    const present = new Set(
      (conn.prepare("select name from sqlite_master where type = 'table'").all() as {
        name: string;
      }[]).map((r) => r.name),
    );
    return REQUIRED.filter((t) => !present.has(t));
  } catch {
    return null;
  } finally {
    conn?.close();
  }
}

/** Read helper (filesystem, not DB): list saved backup files, newest first. */
export async function listBackups(): Promise<BackupFile[]> {
  await requireAuth();
  const dir = backupsDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".db"))
    .map((name) => {
      const st = fs.statSync(path.join(dir, name));
      return { name, size: st.size, mtime: st.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
}
