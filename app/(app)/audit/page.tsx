import type { Metadata } from "next";
import { AlertTriangle, History } from "lucide-react";
import { auditTrail, auditEntities, closedPeriodEditCount } from "@/lib/queries";
import { formatDateShortY, formatPeriodAr, formatTime12 } from "@/lib/dates";
import { formatIQD } from "@/lib/format";
import { AUDIT_ACTION_LABELS, AUDIT_ENTITY_LABELS } from "@/lib/strings";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { NativeSelect } from "@/components/forms/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "سجل التعديلات" };

/** epoch ms -> «8/30/2026 2:30 م» في التوقيت المحلي. */
function formatStamp(at: number | null): string {
  if (!at) return "";
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return `${formatDateShortY(date)} ${formatTime12(`${p(d.getHours())}:${p(d.getMinutes())}`)}`;
}

const ACTION_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  insert: "default",
  update: "secondary",
  delete: "destructive",
};

/**
 * الملاحظات التي تكتبها طبقة الحفظ بالإنجليزية للمطوّر — تُقرأ هنا بالعربية.
 * أي ملاحظة غير معروفة تُعرض كما هي.
 */
const AUDIT_NOTE_LABELS: Record<string, string> = {
  "settlement closed": "إقفال الحصيلة الشهرية",
  "settlement reopened": "إعادة فتح الحصيلة الشهرية",
  "settlement payout finalized": "اعتماد صرف حصص الأطباء",
  "settlement payout cash outflow": "خروج نقد لصرف حصص الأطباء",
  "treatment retyped in the daily entry": "إعادة تفعيل نوع علاج من الدفتر اليومي",
  "payment voided": "إلغاء دفعة",
  "xray removed": "حذف صورة أشعة",
};

/**
 * المبلغ الذي تحرّك في هذا السطر، إن وُجد.
 *
 * كان العمود يطبع رقم السطر في قاعدة البيانات: رقم لا يدلّ العيادة على شيء ولا
 * يمكن البحث به. الدفعات والمصروفات والحركات النقدية تحفظ مبلغها في نفس السطر،
 * وهو الرقم الذي يُراجَع فعلاً. الحالات والمرضى والمواعيد لا مبلغ لها فتبقى
 * الخانة فارغة — وعمود الجدول بجانبها يقول ما الذي تغيّر.
 */
function movedAmount(row: { afterJson: string | null; beforeJson: string | null }) {
  for (const raw of [row.afterJson, row.beforeJson]) {
    if (!raw) continue;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const amount = (parsed as { amount?: unknown }).amount;
        if (typeof amount === "number" && Number.isFinite(amount)) return amount;
      }
    } catch {
      // سطر قديم بصيغة غير متوقّعة — يبقى بلا مبلغ بدل أن تنهار الصفحة.
    }
  }
  return null;
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; flagged?: string }>;
}) {
  const sp = await searchParams;
  const entities = auditEntities();
  const entity = sp.entity && entities.includes(sp.entity) ? sp.entity : undefined;
  const onlyFlagged = sp.flagged === "1";

  const rows = auditTrail({ entity, onlyClosedPeriod: onlyFlagged });
  const flaggedCount = closedPeriodEditCount();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><History className="text-muted-foreground size-6 shrink-0" />سجل التعديلات</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          كل إضافة وتعديل وحذف في النظام، بالترتيب من الأحدث. هذا هو البديل عن
          دفتري الحسابات الكبير والصغير — مصدر واحد للحقيقة مع أثر كامل لكل تغيير.
        </p>
      </header>

      {flaggedCount > 0 ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-50 px-3 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="leading-relaxed">
            يوجد <strong className="tabular-nums">{flaggedCount}</strong> تعديل وقع
            داخل شهر مُقفل. الحصيلة المتأثرة صارت «تحتاج تحديث» — راجعيها ثم أعيدي
            الإقفال.
          </p>
        </div>
      ) : null}

      {/* فلاتر — نموذج GET بسيط بلا حالة على العميل. */}
      <form method="get" data-tour="audit-filters" className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <label htmlFor="au-entity" className="text-muted-foreground text-sm">
            الجدول
          </label>
          <NativeSelect
            id="au-entity"
            name="entity"
            defaultValue={entity ?? ""}
            className="w-48"
          >
            <option value="">كل الجداول</option>
            {entities.map((e) => (
              <option key={e} value={e}>
                {AUDIT_ENTITY_LABELS[e] ?? e}
              </option>
            ))}
          </NativeSelect>
        </div>

        <label className="flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-input px-3">
          <input
            type="checkbox"
            name="flagged"
            value="1"
            defaultChecked={onlyFlagged}
            className="size-5 accent-amber-600"
          />
          <span className="text-sm">تعديلات داخل شهر مُقفل فقط</span>
        </label>

        <Button type="submit" variant="outline" className="h-11">
          تصفية
        </Button>
      </form>

      <Card>
        <CardHeader>
          <CardDescription>
            آخر {rows.length} تعديل
            {rows.length >= 200 ? " (الحد الأقصى المعروض)" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {rows.length === 0 ? (
            <p className="text-muted-foreground py-10 text-center text-sm">
              لا توجد تعديلات مطابقة.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="ps-(--card-spacing)">الوقت</TableHead>
                    <TableHead>الجدول</TableHead>
                    <TableHead>الإجراء</TableHead>
                    <TableHead className="text-end">المبلغ</TableHead>
                    <TableHead>الشهر</TableHead>
                    <TableHead className="pe-(--card-spacing)">ملاحظة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const amount = movedAmount(r);
                    return (
                      <TableRow
                        key={r.id}
                        className={cn(r.hitClosedPeriod && "bg-amber-50 dark:bg-amber-950/20")}
                      >
                        <TableCell className="ps-(--card-spacing) whitespace-nowrap tabular-nums">
                          <span dir="ltr">{formatStamp(r.at)}</span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {AUDIT_ENTITY_LABELS[r.entity] ?? r.entity}
                        </TableCell>
                        <TableCell>
                          <Badge variant={ACTION_VARIANT[r.action] ?? "outline"}>
                            {AUDIT_ACTION_LABELS[r.action] ?? r.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="money text-end font-semibold">
                          {amount === null ? null : formatIQD(amount)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {r.period ? (
                            <span className="inline-flex items-center gap-1.5">
                              {formatPeriodAr(r.period)}
                              {r.hitClosedPeriod ? (
                                <Badge variant="destructive">شهر مُقفل</Badge>
                              ) : null}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="pe-(--card-spacing)">
                          {r.note ? (AUDIT_NOTE_LABELS[r.note] ?? r.note) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
