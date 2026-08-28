import Link from "next/link";
import { Search, StickyNote, Smile } from "lucide-react";
import { orthoCases, listDoctors } from "@/lib/queries";
import { formatIQD } from "@/lib/format";
import { formatDateShortY, todayISO } from "@/lib/dates";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyValue } from "@/components/ui/empty-value";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CASE_STATUS_LABELS } from "@/lib/strings";
import { NewOrthoCaseDialog } from "./ortho-forms";

export default async function OrthoPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();

  const rows = orthoCases(q);
  const doctors = listDoctors({ activeOnly: true });
  const orthoDoctor = doctors.find((d) => d.doesOrtho);
  const defaultDoctorId = orthoDoctor?.id ?? doctors[0]?.id ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Smile className="text-muted-foreground size-6 shrink-0" />التقويم</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            سجل حالات التقويم مع تتبّع المواعيد والملاحظات المهمة على كل حالة.
          </p>
        </div>
        <div data-tour="ortho-add">
          <NewOrthoCaseDialog
            doctors={doctors.map((d) => ({ id: d.id, name: d.name }))}
            defaultDoctorId={defaultDoctorId}
            today={todayISO()}
          />
        </div>
      </div>

      <form method="get" className="flex items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2" />
          <Input
            name="q"
            defaultValue={q}
            type="search"
            placeholder="ابحث باسم المريض…"
            className="h-11 ps-9"
          />
        </div>
        <Button type="submit" variant="outline" className="h-11">
          بحث
        </Button>
      </form>

      <div
        data-tour="ortho-list"
        className="rounded-xl ring-1 ring-foreground/10"
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>المريض</TableHead>
              <TableHead className="hidden md:table-cell">الطبيب</TableHead>
              <TableHead className="hidden lg:table-cell">التاريخ</TableHead>
              <TableHead className="hidden text-end sm:table-cell">المقدمة</TableHead>
              <TableHead className="hidden md:table-cell">الحالة</TableHead>
              <TableHead className="text-end">المدفوع</TableHead>
              <TableHead>الموعد القادم</TableHead>
              <TableHead>الملاحظة</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-muted-foreground py-10 text-center"
                >
                  {q ? "لا توجد نتائج مطابقة." : "لا توجد حالات تقويم بعد."}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/ortho/${r.id}`}
                      className="text-primary inline-flex min-h-11 items-center underline-offset-4 hover:underline"
                    >
                      {r.patientName}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {r.doctorName}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap lg:table-cell">
                    <span dir="ltr" className="tabular-nums">
                      {formatDateShortY(r.openedDate)}
                    </span>
                  </TableCell>
                  {/* المقدمة المتفق عليها، وتحتها ما بقي منها: الرقم وحده كان
                      يُقرأ «قُبضت» وهو في الحقيقة اتفاق لم يكتمل. */}
                  <TableCell className="money hidden text-end sm:table-cell">
                    {formatIQD(r.downPaymentAgreed)}
                    {r.downPaymentAgreed - r.downPayment > 0 ? (
                      <span className="text-muted-foreground block text-xs font-normal">
                        متبقٍ منها {formatIQD(r.downPaymentAgreed - r.downPayment)}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant={r.status === "open" ? "default" : "secondary"}>
                      {CASE_STATUS_LABELS[r.status] ?? r.status}
                    </Badge>
                  </TableCell>
                  {/* المدفوع هو رقم التقويم الوحيد الذي يُقرأ من السطر — لا إجمالي
                      ولا متبقٍ في هذا السجل، فيأخذ حجم الرقم الحاسم. */}
                  <TableCell className="money text-end text-lg font-bold">
                    {formatIQD(r.paid)}
                  </TableCell>
                  <TableCell>
                    {r.nextAppointment ? (
                      <span dir="ltr" className="tabular-nums">
                        {formatDateShortY(r.nextAppointment)}
                      </span>
                    ) : (
                      <EmptyValue>غير محدَّد</EmptyValue>
                    )}
                  </TableCell>
                  {/* الملاحظة نفسها، لا إشارة إلى وجودها: سطر واحد مختصر، والنص
                      الكامل يظهر عند المرور، والضغط يفتح الحالة. */}
                  <TableCell>
                    {r.hasComplaint ? (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Link
                              href={`/ortho/${r.id}`}
                              className="hover:text-primary flex min-h-11 max-w-64 items-center gap-1.5 text-start underline-offset-4 hover:underline"
                            />
                          }
                        >
                          <StickyNote className="text-muted-foreground size-4 shrink-0" />
                          <span className="truncate">
                            {r.complaintNote?.trim() || "ملاحظة مسجّلة على الحالة"}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-sm text-sm whitespace-pre-wrap">
                          {r.complaintNote?.trim() || "ملاحظة مسجّلة على الحالة"}
                        </TooltipContent>
                      </Tooltip>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
