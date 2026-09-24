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
  // ⚠️ Read here, not in the client: which tours are done now lives in the
  // database (see `lib/tour-state.ts` for why localStorage was wrong). This
  // row is already loaded, so it costs no extra query.
  let toursSeen: string[] = [];
  try {
    toursSeen = JSON.parse(settings.toursSeen ?? "[]");
    if (!Array.isArray(toursSeen)) toursSeen = [];
  } catch {
    toursSeen = [];
  }
  return (
    <AppShell
      clinicName={settings.clinicName}
      cashOnHand={cashOnHand()}
      // A demo install and an empty one are both "nobody has worked here yet",
      // which is exactly when an unprompted walkthrough helps rather than
      // interrupts.
      offerIntro={demoMode || !hasAnyRecords()}
      toursSeen={toursSeen}
    >
      {children}
    </AppShell>
  );
}
