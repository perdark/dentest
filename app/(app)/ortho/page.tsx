import Link from "next/link";
import { Search, StickyNote, Smile } from "lucide-react";
import { orthoCases, listDoctors } from "@/lib/queries";
import { formatIQD } from "@/lib/format";
import { formatDateAr, todayISO } from "@/lib/dates";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
              <TableHead>الطبيب</TableHead>
              <TableHead>التاريخ</TableHead>
              <TableHead className="text-end">المقدمة</TableHead>
              <TableHead className="text-end">المدفوع</TableHead>
              <TableHead>الموعد القادم</TableHead>
              <TableHead>ملاحظة</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
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
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {r.patientName}
                    </Link>
                  </TableCell>
                  <TableCell>{r.doctorName}</TableCell>
                  <TableCell>{formatDateAr(r.openedDate)}</TableCell>
                  <TableCell className="money text-end">
                    {formatIQD(r.downPayment)}
                  </TableCell>
                  <TableCell className="money text-end font-medium">
                    {formatIQD(r.paid)}
                  </TableCell>
                  <TableCell>
                    {r.nextAppointment ? (
                      formatDateAr(r.nextAppointment)
                    ) : (
                      <span className="text-muted-foreground/60 text-xs">
                        غير محدَّد
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {r.hasComplaint ? (
                      <Badge variant="secondary" className="gap-1">
                        <StickyNote className="size-3" />
                        ملاحظة
                      </Badge>
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
