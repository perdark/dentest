import { debtsList } from "@/lib/queries";
import { formatIQD } from "@/lib/format";
import { formatDateAr, todayISO } from "@/lib/dates";
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
        <h1 className="text-2xl font-bold">الديون</h1>
        <p className="text-muted-foreground text-sm">
          قائمة المرضى المتبقّي عليهم مبالغ — للاتصال والتحصيل.
        </p>
      </header>

      <Card size="sm" className="bg-destructive/5 ring-destructive/20">
        <CardHeader>
          <CardDescription>إجمالي الديون</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="money text-destructive text-2xl font-bold sm:text-3xl">
            {formatIQD(total)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>قائمة الديون</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-muted-foreground py-10 text-center text-sm">
              لا توجد ديون مستحقة.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>المريض</TableHead>
                  <TableHead>الهاتف</TableHead>
                  <TableHead>العلاج</TableHead>
                  <TableHead>الطبيب</TableHead>
                  <TableHead>آخر دفعة</TableHead>
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
                          className="text-primary inline-flex min-h-11 items-center underline-offset-4 hover:underline"
                        >
                          {r.phone}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{r.treatment}</TableCell>
                    <TableCell>{r.doctorName}</TableCell>
                    <TableCell>
                      {r.lastPaymentDate ? formatDateAr(r.lastPaymentDate) : "—"}
                    </TableCell>
                    <TableCell className="money text-destructive text-end font-semibold">
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
