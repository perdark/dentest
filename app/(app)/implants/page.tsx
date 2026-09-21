import Link from "next/link";
import { Search, IdCard } from "lucide-react";
import { implantIndex, listDoctors } from "@/lib/queries";
import { formatIQD } from "@/lib/format";
import { formatDateShortY, todayISO } from "@/lib/dates";
import { CASE_STATUS_LABELS } from "@/lib/strings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyValue } from "@/components/ui/empty-value";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NewCard } from "./new-card";

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  open: "default",
  completed: "secondary",
  cancelled: "destructive",
};

export default async function ImplantsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const rows = implantIndex(q);
  const doctors = listDoctors({ activeOnly: true, does: "implant" }).map((d) => ({
    id: d.id,
    name: d.name,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><IdCard className="text-muted-foreground size-6 shrink-0" />سجل الزراعة</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            فهرس بطاقات الزراعة مرتّبة حسب رقم الكارت
          </p>
        </div>
        <div data-tour="implants-add">
          <NewCard doctors={doctors} today={todayISO()} />
        </div>
      </div>

      <form
        method="get"
        data-tour="implants-search"
        className="flex items-center gap-2"
      >
        <Input
          name="q"
          defaultValue={q}
          inputMode="search"
          placeholder="ابحث بالاسم أو رقم الكارت"
          className="h-11 max-w-xs"
        />
        <Button type="submit" variant="outline" className="h-11">
          <Search className="size-4" />
          بحث
        </Button>
      </form>

      {rows.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
          {q
            ? "لا توجد بطاقات مطابقة لبحثك."
            : "لا توجد بطاقات زراعة بعد. أنشئ بطاقة جديدة للبدء."}
        </div>
      ) : (
        <div
          data-tour="implants-list"
          className="rounded-xl ring-1 ring-foreground/10"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>رقم الكارت</TableHead>
                <TableHead>المريض</TableHead>
                <TableHead className="hidden md:table-cell">الطبيب</TableHead>
                <TableHead className="hidden text-start sm:table-cell">الإجمالي</TableHead>
                <TableHead className="text-start">المدفوع</TableHead>
                <TableHead className="text-start">المتبقي</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead className="hidden lg:table-cell">التاريخ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-semibold tabular-nums">
                    {r.implantCardNo ?? <EmptyValue>بلا رقم</EmptyValue>}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/implants/${r.id}`}
                      className="text-primary inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline"
                    >
                      {r.patientName}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{r.doctorName}</TableCell>
                  <TableCell className="money hidden text-start tabular-nums sm:table-cell">
                    {formatIQD(r.totalPrice)}
                  </TableCell>
                  <TableCell className="money text-start tabular-nums">
                    {formatIQD(r.paid)}
                  </TableCell>
                  {/* «المتبقي» هو العمود الذي يُقرأ من هذا الجدول، فيكبر عن جيرانه. */}
                  <TableCell className="money text-start text-lg font-bold tabular-nums">
                    {formatIQD(r.remaining)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[r.status] ?? "outline"}>
                      {CASE_STATUS_LABELS[r.status] ?? r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap lg:table-cell">
                    <span dir="ltr" className="tabular-nums">
                      {formatDateShortY(r.openedDate)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
