import Link from "next/link";
import { ChevronRight, ChevronLeft, Receipt } from "lucide-react";
import { expensesForMonth } from "@/lib/queries";
import { formatIQD } from "@/lib/format";
import { formatDateAr, formatPeriodAr, todayISO, currentPeriod, shiftPeriod } from "@/lib/dates";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  expenseCategoryTotal,
} from "@/lib/strings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExpenseForm } from "./expense-form";
import { DeleteExpenseButton } from "./delete-expense-button";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const sp = await searchParams;
  const period =
    sp.period && /^\d{4}-\d{2}$/.test(sp.period) ? sp.period : currentPeriod();
  const prev = shiftPeriod(period, -1);
  const next = shiftPeriod(period, 1);

  const { rows, byCategory, total } = expensesForMonth(period);
  const totals = new Map(byCategory.map((c) => [c.category, c.total]));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Receipt className="text-muted-foreground size-6 shrink-0" />المصروفات</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-11" nativeButton={false} render={<Link href={`?period=${prev}`} />}>
            <ChevronRight className="size-4" />
            الشهر السابق
          </Button>
          <span className="min-w-28 text-center text-sm font-semibold">
            {formatPeriodAr(period)}
          </span>
          <Button variant="outline" size="sm" className="h-11" nativeButton={false} render={<Link href={`?period=${next}`} />}>
            الشهر التالي
            <ChevronLeft className="size-4" />
          </Button>
        </div>
      </header>

      {/* بطاقات إجمالي كل فئة + الإجمالي العام */}
      <section
        data-tour="expenses-totals"
        className="animate-stagger grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
      >
        {EXPENSE_CATEGORIES.map((c) => (
          <Card key={c.key} size="sm">
            <CardHeader>
              <CardDescription>{c.label}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="money text-lg font-bold sm:text-xl">
                {formatIQD(expenseCategoryTotal(totals, c))}
              </p>
            </CardContent>
          </Card>
        ))}
        <Card size="sm" className="bg-primary/5 ring-primary/30 col-span-2 sm:col-span-1">
          <CardHeader>
            <CardDescription className="text-foreground">الإجمالي العام</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="money text-xl font-bold sm:text-2xl">{formatIQD(total)}</p>
          </CardContent>
        </Card>
      </section>

      <div data-tour="expenses-form">
        <ExpenseForm today={todayISO()} />
      </div>

      {/* جدول المصروفات */}
      <Card>
        <CardContent className="px-0">
          {rows.length === 0 ? (
            <p className="text-muted-foreground px-4 py-8 text-center text-sm">
              لا توجد مصروفات مُسجّلة في {formatPeriodAr(period)}.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>الفئة</TableHead>
                  <TableHead className="text-end">المبلغ</TableHead>
                  <TableHead>ملاحظة</TableHead>
                  <TableHead className="w-px text-end">حذف</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDateAr(r.expenseDate)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {EXPENSE_CATEGORY_LABELS[r.category] ?? r.category}
                    </TableCell>
                    <TableCell className="money text-end">{formatIQD(r.amount)}</TableCell>
                    <TableCell className="text-muted-foreground max-w-48 truncate whitespace-normal">
                      {r.note}
                    </TableCell>
                    <TableCell className="text-end">
                      <DeleteExpenseButton
                        id={r.id}
                        amount={r.amount}
                        category={EXPENSE_CATEGORY_LABELS[r.category] ?? r.category}
                        expenseDate={r.expenseDate}
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
