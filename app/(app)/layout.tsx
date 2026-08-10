import { requireAuth } from "@/lib/auth";
import { getSettings, cashOnHand } from "@/lib/server-utils";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAuth();
  const settings = getSettings();
  return (
    <AppShell
      clinicName={settings.clinicName}
      cashOnHand={cashOnHand()}
      reserveThreshold={settings.cashReserveThreshold}
    >
      {children}
    </AppShell>
  );
}
