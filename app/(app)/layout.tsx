import { requireAuth } from "@/lib/auth";
import { getSettings, cashOnHand } from "@/lib/server-utils";
import { hasAnyRecords } from "@/lib/queries";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAuth();
  const settings = getSettings();
  const demoMode = settings.demoDataAt != null;
  return (
    <AppShell
      clinicName={settings.clinicName}
      cashOnHand={cashOnHand()}
      reserveThreshold={settings.cashReserveThreshold}
      // A demo install and an empty one are both "nobody has worked here yet",
      // which is exactly when an unprompted walkthrough helps rather than
      // interrupts.
      offerIntro={demoMode || !hasAnyRecords()}
    >
      {children}
    </AppShell>
  );
}
