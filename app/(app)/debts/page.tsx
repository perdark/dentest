import { PhoneCall, PhoneOff } from "lucide-react";
import { debtsList } from "@/lib/queries";
import { formatIQD } from "@/lib/format";
import { formatDateShortY, todayISO } from "@/lib/dates";
import { EmptyValue } from "@/components/ui/empty-value";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PayDialog } from "./pay-dialog";

export default function DebtsPage() {
  const rows = debtsList();
  const total = rows.reduce((sum, r) => sum + r.remaining, 0);
  const today = todayISO();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><PhoneCall className="text-muted-foreground size-6 shrink-0" />الديون</h1>
        <p className="text-muted-foreground text-sm">
          أرصدة المرضى المتبقّية — للمتابعة والتحصيل.
        </p>
      </header>

      {/* العيادة طلبت اسم «الديون» صراحةً (2026-08-19) — عكس التسمية السابقة، وكلمة
          «مستحقات» صارت محجوزة لمستحقات الأطباء وحدها. النبرة تبقى محايدة بلا لون
          تحذير. التفاصيل في docs/OWNER-NOTES.md §3. */}
      <Card size="sm" data-tour="debts-total" className="bg-primary/5 ring-primary/20">
        <CardHeader>
          <CardDescription>إجمالي الديون</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="money text-2xl font-bold sm:text-3xl">{formatIQD(total)}</p>
        </CardContent>
      </Card>

      <Card data-tour="debts-list">
        <CardHeader>
          <CardTitle>أرصدة المرضى</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-muted-foreground py-10 text-center text-sm">
              لا توجد ديون — كل الحسابات مسدَّدة.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>المريض</TableHead>
                  <TableHead>الهاتف</TableHead>
                  <TableHead className="hidden sm:table-cell">العلاج</TableHead>
                  <TableHead className="hidden md:table-cell">الطبيب</TableHead>
                  <TableHead className="hidden lg:table-cell">آخر دفعة</TableHead>
                  <TableHead className="text-end">المتبقي</TableHead>
                  <TableHead className="text-end">إجراء</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.patientName}</TableCell>
                    <TableCell>
                      {r.phone ? (
                        /* هدف لمس ≥44px — الاتصال هو الغرض الأساسي لهذه الشاشة. */
                        <a
                          href={`tel:${r.phone}`}
                          dir="ltr"
                          className="text-primary money inline-flex min-h-11 items-center underline-offset-4 hover:underline"
                        >
                          {r.phone}
                        </a>
                      ) : (
                        /* شاشة التحصيل كلها اتصال: غياب الرقم خبرٌ يُقرأ، لا
                           فراغ باهت — أيقونة مع نص، بحجم بقية الخانات. */
                        <span className="inline-flex min-h-11 items-center gap-1.5">
                          <PhoneOff className="text-muted-foreground size-4 shrink-0" />
                          <EmptyValue>بلا رقم هاتف</EmptyValue>
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{r.treatment}</TableCell>
                    <TableCell className="hidden md:table-cell">{r.doctorName}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {r.lastPaymentDate ? (
                        <span dir="ltr" className="tabular-nums">
                          {formatDateShortY(r.lastPaymentDate)}
                        </span>
                      ) : (
                        <EmptyValue>لم تُدفع أي دفعة</EmptyValue>
                      )}
                    </TableCell>
                    {/* الرقم الذي تُقرأ الشاشة من أجله. */}
                    <TableCell className="money text-end text-lg font-bold">
                      {formatIQD(r.remaining)}
                    </TableCell>
                    <TableCell className="text-end">
                      <PayDialog
                        caseId={r.id}
                        patientName={r.patientName}
                        remaining={r.remaining}
                        today={today}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
