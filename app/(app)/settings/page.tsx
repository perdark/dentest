import { Settings } from "lucide-react";
import type { Metadata } from "next";
import { getSettings } from "@/lib/server-utils";
import { listDoctors } from "@/lib/queries";
import { listBackups } from "@/lib/actions/settings";
import { SettingsForms } from "./settings-forms";

export const metadata: Metadata = { title: "الإعدادات" };

export default async function SettingsPage() {
  const s = getSettings();
  const doctors = listDoctors();
  const backups = await listBackups();

  // Ship only display fields to the client component — never expose the
  // secret columns (pinHash / sessionSecret) in the RSC payload.
  const settings = {
    clinicName: s.clinicName,
    openingCashBalance: s.openingCashBalance,
    cashReserveThreshold: s.cashReserveThreshold,
    defaultCommissionPct: s.defaultCommissionPct,
    labDeductedPerDoctor: s.labDeductedPerDoctor,
    pctAppliedAfterLab: s.pctAppliedAfterLab,
    staffSalaryMode: s.staffSalaryMode,
  };

  return (
    <div data-tour="settings-page" className="mx-auto w-full max-w-2xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Settings className="text-muted-foreground size-6 shrink-0" />الإعدادات</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          إعدادات العيادة والحساب ونِسَب الأطباء ورمز الدخول والنسخ الاحتياطي.
        </p>
      </div>

      <SettingsForms settings={settings} doctors={doctors} backups={backups} />
    </div>
  );
}
