import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { caseWithDetails, teethForCase, patientToothMap } from "@/lib/queries";
import { formatDateShortY } from "@/lib/dates";
import { ToothChartEditor } from "@/components/tooth-chart/tooth-chart-editor";
import type { ToothState } from "@/components/tooth-chart/odontogram";
import type { Arch } from "@/lib/db/teeth";

export default async function CaseTeethPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const caseId = Number(id);
  if (!Number.isInteger(caseId) || caseId <= 0) notFound();

  const theCase = caseWithDetails(caseId);
  if (!theCase) notFound();

  const marks = teethForCase(caseId);

  const initialTeeth = new Map<number, ToothState>();
  for (const m of marks) {
    if (m.scope === "tooth" && m.toothCode !== null) {
      initialTeeth.set(m.toothCode, { surfaces: m.surfaces, note: m.note ?? "" });
    }
  }
  const initialArches: Arch[] = marks
    .filter((m) => m.scope === "arch" && m.arch !== null)
    .map((m) => m.arch as Arch);
  const initialMouth = marks.some((m) => m.scope === "mouth");

  // Teeth touched by this patient's OTHER cases, shown behind the selection so
  // the doctor sees the tooth's past without leaving the screen. Counting only
  // other cases keeps the current case's own marks from appearing twice.
  const history = new Map<number, number>();
  for (const [code, events] of patientToothMap(theCase.patientId)) {
    const others = events.filter((e) => e.caseId !== caseId).length;
    if (others > 0) history.set(code, others);
  }

  return (
    <div className="space-y-4">
      <Link
        href={`/patients/${theCase.patientId}`}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowRight className="size-4" />
        رجوع إلى ملف {theCase.patientName}
      </Link>

      <div>
        <h1 className="text-xl font-semibold">{theCase.treatment}</h1>
        <p className="text-muted-foreground text-sm">
          {theCase.patientName} · د. {theCase.doctorName} ·{" "}
          <span dir="ltr" className="tabular-nums">
            {formatDateShortY(theCase.openedDate)}
          </span>
        </p>
      </div>

      <ToothChartEditor
        caseId={caseId}
        initialTeeth={initialTeeth}
        initialArches={initialArches}
        initialMouth={initialMouth}
        history={history}
        treatmentAr={theCase.treatment}
      />
    </div>
  );
}
