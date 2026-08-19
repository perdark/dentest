import Link from "next/link";
import { Phone, Search, Users } from "lucide-react";
import { listDoctors, patientsList } from "@/lib/queries";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyValue } from "@/components/ui/empty-value";
import { MedicalBadge } from "@/components/ui/medical-badge";
import { NativeSelect } from "@/components/forms/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PatientForm } from "./patient-form";

/** «راجعوا مؤخراً» = خلال ثلاثة أشهر — الفترة التي تسأل عنها العيادة عملياً. */
const RECENT_DAYS = 90;

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; doctorId?: string; balance?: string; recent?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const doctors = listDoctors({ activeOnly: true });
  const chosenDoctor = Number(sp.doctorId);
  const doctorId =
    Number.isInteger(chosenDoctor) && doctors.some((d) => d.id === chosenDoctor)
      ? chosenDoctor
      : undefined;
  const hasBalance = sp.balance === "1";
  const recentOnly = sp.recent === "1";

  const rows = patientsList({
    q,
    doctorId,
    hasBalance,
    visitedWithinDays: recentOnly ? RECENT_DAYS : undefined,
  });
  const filtered = Boolean(q || doctorId || hasBalance || recentOnly);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Users className="text-muted-foreground size-6 shrink-0" />المرضى</h1>
        <div data-tour="patients-add">
          <PatientForm />
        </div>
      </div>

      {/* فلاتر — نموذج GET بسيط بلا حالة على العميل، والتصفية كلها على الخادم. */}
      <form method="get" data-tour="patients-search" className="flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2" />
          <Input
            name="q"
            type="search"
            inputMode="search"
            defaultValue={q}
            placeholder="ابحث بالاسم أو رقم الهاتف"
            className="h-11 ps-9"
          />
        </div>

        <NativeSelect
          name="doctorId"
          defaultValue={doctorId ? String(doctorId) : ""}
          aria-label="الطبيب"
          className="w-44"
        >
          <option value="">كل الأطباء</option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </NativeSelect>

        <label className="border-input flex h-11 cursor-pointer items-center gap-2 rounded-lg border px-3">
          <input
            type="checkbox"
            name="balance"
            value="1"
            defaultChecked={hasBalance}
            className="size-5 accent-primary"
          />
          <span className="text-sm">عليهم رصيد</span>
        </label>

        <label className="border-input flex h-11 cursor-pointer items-center gap-2 rounded-lg border px-3">
          <input
            type="checkbox"
            name="recent"
            value="1"
            defaultChecked={recentOnly}
            className="size-5 accent-primary"
          />
          <span className="text-sm">راجعوا خلال ٩٠ يوماً</span>
        </label>

        <Button type="submit" variant="secondary" className="h-11">
          بحث
        </Button>
      </form>

      {rows.length === 0 ? (
        <div className="text-muted-foreground rounded-xl px-4 py-12 text-center ring-1 ring-foreground/10">
          {filtered
            ? "لا توجد نتائج مطابقة لبحثك."
            : "لا يوجد مرضى بعد. ابدأ بإضافة مريض."}
        </div>
      ) : (
        <div
          data-tour="patients-list"
          className="overflow-hidden rounded-xl ring-1 ring-foreground/10"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الاسم</TableHead>
                <TableHead>رقم الهاتف</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link
                      href={`/patients/${p.id}`}
                      className="text-primary font-medium hover:underline"
                    >
                      {p.fullName}
                    </Link>
                    <MedicalBadge flags={p.medicalFlags} className="mt-1 flex" />
                  </TableCell>
                  <TableCell>
                    {p.phone ? (
                      <a
                        href={`tel:${p.phone}`}
                        dir="ltr"
                        className="text-primary inline-flex items-center gap-1.5 hover:underline"
                      >
                        <Phone className="size-3.5" />
                        <span className="money">{p.phone}</span>
                      </a>
                    ) : (
                      <EmptyValue>بلا رقم</EmptyValue>
                    )}
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
