import { Settings } from "lucide-react";
import type { Metadata } from "next";
import { getSettings } from "@/lib/server-utils";
import { listBackups, pendingRestore } from "@/lib/actions/settings";
import { SettingsForms } from "./settings-forms";

export const metadata: Metadata = { title: "الإعدادات" };

export default async function SettingsPage() {
  const s = getSettings();
  const backups = await listBackups();
  const pendingRestoreName = await pendingRestore();

  // Ship only display fields to the client component — never expose the
  // secret columns (pinHash / sessionSecret) in the RSC payload.
  const settings = {
    openingCashBalance: s.openingCashBalance,
    cashReserveThreshold: s.cashReserveThreshold,
    labDeductedPerDoctor: s.labDeductedPerDoctor,
    pctAppliedAfterLab: s.pctAppliedAfterLab,
  };

  return (
    <div data-tour="settings-page" className="mx-auto w-full max-w-2xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Settings className="text-muted-foreground size-6 shrink-0" />الإعدادات</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          إعدادات العيادة والحساب ورمز الدخول والنسخ الاحتياطي.
        </p>
      </div>

      <SettingsForms
        settings={settings}
        backups={backups}
        pendingRestoreName={pendingRestoreName}
      />
    </div>
  );
}
