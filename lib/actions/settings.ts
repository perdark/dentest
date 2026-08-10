"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import fs from "node:fs";
import path from "node:path";
import { backupsDir } from "@/lib/paths";
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
    const file = path.join(dir, `dentest-${stamp}.db`);
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
