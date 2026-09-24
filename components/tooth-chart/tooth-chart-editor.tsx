"use client";

import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ToothState } from "./odontogram";
import {
  ToothMarksPicker,
  buildToothPayload,
  type ToothMarkPayload,
} from "./tooth-marks-picker";
import type { Arch } from "@/lib/db/teeth";
import { saveCaseTeethAction } from "@/lib/actions/tooth-chart";

/** «مخطط الأسنان» for one case — the chart plus its own save. */
export function ToothChartEditor({
  caseId,
  initialTeeth,
  initialArches,
  initialMouth,
  history,
  treatmentAr,
}: {
  caseId: number;
  initialTeeth: Map<number, ToothState>;
  initialArches: Arch[];
  initialMouth: boolean;
  history?: Map<number, number>;
  treatmentAr?: string;
}) {
  const [pending, startTransition] = useTransition();
  const payload = useRef<ToothMarkPayload[]>(
    buildToothPayload(new Map(initialTeeth), new Set(initialArches), initialMouth),
  );

  const save = () => {
    startTransition(async () => {
      const res = await saveCaseTeethAction({ caseId, marks: payload.current });
      if (res.ok) toast.success("تم حفظ مخطط الأسنان.");
      else toast.error(res.error ?? "تعذّر الحفظ.");
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span>مخطط الأسنان</span>
          {treatmentAr && (
            <span className="text-muted-foreground text-sm font-normal">{treatmentAr}</span>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <ToothMarksPicker
          initialTeeth={initialTeeth}
          initialArches={initialArches}
          initialMouth={initialMouth}
          history={history}
          onChange={(p) => {
            payload.current = p;
          }}
        />

        <div className="flex justify-end">
          <Button type="button" onClick={save} disabled={pending}>
            {pending ? "جارٍ الحفظ…" : "حفظ المخطط"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
