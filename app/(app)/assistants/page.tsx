import Link from "next/link";
import type { Metadata } from "next";
import { HandHelping } from "lucide-react";
import { assistantsList, listDoctors } from "@/lib/queries";
import { computeSettlement } from "@/lib/settlement";
import { formatIQD } from "@/lib/format";
import { currentPeriod, formatDateShortY, formatPeriodAr, todayISO } from "@/lib/dates";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AssistantDialog,
  AssistantEndButton,
  DeleteAssistantButton,
  type DoctorOption,
} from "./assistant-forms";

export const metadata: Metadata = { title: "المساعدون" };

/**
 * «المساعدون» — doctors' assistants and what each one is paid. [2026-10-28]
 *
 * Every assistant belongs to one doctor and is paid out of that doctor's
 * monthly share (the clinic's rule): a fixed salary, or a % of the share. This
 * screen is configuration; the money itself is frozen and paid out from
 * «الحصيلة الشهرية» together with the doctors' shares.
 */
export default async function AssistantsPage() {
  const today = todayISO();
  const period = currentPeriod();
  const rows = assistantsList();
  const settlement = computeSettlement(period);
  const doctors = listDoctors({ activeOnly: true });

  const doctorOptions: DoctorOption[] = doctors.map((d) => {
    const s = settlement.doctors.find((x) => x.doctorId === d.id);
    return {
      id: d.id,
      name: d.name,
      isOwner: d.isOwner,
      share: s?.grossPayout ?? 0,
      assistantsTotal: s?.assistantsTotal ?? 0,
    };
  });
  const thisMonth = new Map(settlement.assistants.map((a) => [a.assistantId, a.amount]));
  const totalThisMonth = settlement.totalAssistants;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <HandHelping className="text-muted-foreground size-6 shrink-0" />
            المساعدون
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            مساعدو الأطباء — أجر كل مساعد يُخصم من حصة طبيبه الشهرية، ويُصرف من{" "}
            <Link
              href="/settlement"
              className="text-primary font-medium underline-offset-4 hover:underline"
            >
              «الحصيلة الشهرية»
            </Link>
            .
          </p>
        </div>
        <AssistantDialog doctors={doctorOptions} today={today} />
      </header>

      <div data-tour="assistants-list" className="ring-foreground/10 rounded-xl ring-1">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
            <HandHelping className="text-muted-foreground size-12" />
            <p className="text-base font-medium">لا يوجد مساعدون بعد</p>
            <p className="text-muted-foreground max-w-sm text-sm">
              أضف مساعد الطبيب مع راتبه الشهري أو نسبته من حصة الطبيب، فيُخصم أجره
              من الحصة تلقائياً كل شهر.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>المساعد</TableHead>
                <TableHead>الطبيب</TableHead>
                <TableHead>الأجر</TableHead>
                <TableHead className="hidden md:table-cell">منذ</TableHead>
                <TableHead className="text-end">
                  أجر {formatPeriodAr(period)}
                </TableHead>
                <TableHead className="sr-only">إجراء</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => {
                const amount = thisMonth.get(a.id) ?? 0;
                return (
                  <TableRow key={a.id} className={a.working ? undefined : "opacity-70"}>
                    <TableCell className="font-medium">
                      <span className="inline-flex flex-wrap items-center gap-2">
                        {a.name}
                        {a.working ? null : (
                          <Badge variant="secondary">
                            متوقف منذ{" "}
                            <span dir="ltr" className="tabular-nums">
                              {formatDateShortY(a.endDate!)}
                            </span>
                          </Badge>
                        )}
                      </span>
                      {a.notes ? (
                        <span className="text-muted-foreground block text-sm font-normal">
                          {a.notes}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>{a.doctorName}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {a.payMode === "salary" ? (
                        <>
                          راتب <span className="money font-semibold">{formatIQD(a.salary)}</span>
                        </>
                      ) : (
                        <>
                          <span dir="ltr" className="font-semibold tabular-nums">
                            {a.pct}%
                          </span>{" "}
                          من حصة الطبيب
                        </>
                      )}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap md:table-cell">
                      <span dir="ltr" className="tabular-nums">
                        {formatDateShortY(a.startDate)}
                      </span>
                    </TableCell>
                    <TableCell className="money text-end text-base font-bold">
                      {formatIQD(amount)}
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="flex items-center justify-end gap-1">
                        <AssistantDialog
                          doctors={doctorOptions}
                          today={today}
                          assistant={{
                            id: a.id,
                            name: a.name,
                            doctorId: a.doctorId,
                            payMode: a.payMode,
                            salary: a.salary,
                            pct: a.pct,
                            startDate: a.startDate,
                            notes: a.notes,
                            thisMonth: amount,
                          }}
                        />
                        <AssistantEndButton
                          id={a.id}
                          name={a.name}
                          working={a.working}
                          startDate={a.startDate}
                          today={today}
                        />
                        <DeleteAssistantButton id={a.id} name={a.name} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {rows.length > 0 ? (
        <p className="text-sm">
          <span className="text-muted-foreground">مجموع أجور المساعدين في {formatPeriodAr(period)}: </span>
          <span className="money font-semibold">{formatIQD(totalThisMonth)}</span>
          <span className="text-muted-foreground">
            {" "}
            — من حصص أطبائهم، والنسبة تتغيّر مع حصة الطبيب حتى يُقفل الشهر.
          </span>
        </p>
      ) : null}
    </div>
  );
}
