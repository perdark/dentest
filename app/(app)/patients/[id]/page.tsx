import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, MapPin, Phone } from "lucide-react";
import { patientById, casesForPatient } from "@/lib/queries";
import { formatIQD } from "@/lib/format";
import { formatDateAr } from "@/lib/dates";
import { CASE_STATUS_LABELS } from "@/lib/strings";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PatientForm } from "../patient-form";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  open: "default",
  completed: "secondary",
  cancelled: "outline",
};

export default async function PatientProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const patient = patientById(Number(id));
  if (!patient) notFound();

  const cases = casesForPatient(patient.id);
  const totalRemaining = cases.reduce(
    (sum, c) => sum + (c.status === "cancelled" ? 0 : c.remaining),
    0,
  );

  return (
    <div className="space-y-4">
      <Link
        href="/patients"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowRight className="size-4" />
        كل المرضى
      </Link>

      {/* بطاقة معلومات المريض */}
      <Card>
        <CardContent className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <h1 className="text-xl font-bold">{patient.fullName}</h1>
            <div className="text-muted-foreground space-y-1 text-sm">
              {patient.phone ? (
                <a
                  href={`tel:${patient.phone}`}
                  dir="ltr"
                  className="text-primary flex w-fit items-center gap-1.5 hover:underline"
                >
                  <Phone className="size-4 shrink-0" />
                  <span className="money">{patient.phone}</span>
                </a>
              ) : (
                <p className="flex items-center gap-1.5">
                  <Phone className="size-4 shrink-0" />
                  لا يوجد رقم هاتف
                </p>
              )}
              {patient.address ? (
                <p className="flex items-center gap-1.5">
                  <MapPin className="size-4 shrink-0" />
                  {patient.address}
                </p>
              ) : null}
            </div>
          </div>
          <PatientForm mode="edit" patient={patient} />
        </CardContent>
      </Card>

      {/* الحالات والعلاجات */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">الحالات والعلاجات</h2>

        {cases.length === 0 ? (
          <div className="text-muted-foreground rounded-xl px-4 py-10 text-center ring-1 ring-foreground/10">
            لا توجد حالات مسجّلة لهذا المريض.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>العلاج</TableHead>
                  <TableHead className="hidden md:table-cell">الطبيب</TableHead>
                  <TableHead className="hidden sm:table-cell">تاريخ الفتح</TableHead>
                  <TableHead className="text-end">الإجمالي</TableHead>
                  <TableHead className="text-end">المدفوع</TableHead>
                  <TableHead className="text-end">المتبقي</TableHead>
                  <TableHead>الحالة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cases.map((c) => {
                  const href = c.isImplant
                    ? `/implants/${c.id}`
                    : c.bucket === "ortho"
                      ? "/ortho"
                      : null;
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        {href ? (
                          <Link
                            href={href}
                            className="text-primary font-medium hover:underline"
                          >
                            {c.treatment}
                          </Link>
                        ) : (
                          <span className="font-medium">{c.treatment}</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{c.doctorName}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {formatDateAr(c.openedDate)}
                      </TableCell>
                      <TableCell className="text-end">
                        <span className="money">{formatIQD(c.totalPrice)}</span>
                      </TableCell>
                      <TableCell className="text-end">
                        <span className="money">{formatIQD(c.paid)}</span>
                      </TableCell>
                      <TableCell className="text-end">
                        <span
                          className={cn("money", c.remaining > 0 && "text-destructive font-medium")}
                        >
                          {formatIQD(c.remaining)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[c.status] ?? "outline"}>
                          {CASE_STATUS_LABELS[c.status] ?? c.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* إجمالي المتبقي على المريض */}
        <div className="bg-muted/50 flex items-center justify-between gap-3 rounded-xl px-4 py-3 ring-1 ring-foreground/10">
          <span className="font-medium">إجمالي المتبقي على المريض</span>
          <span
            className={cn(
              "money text-lg font-bold",
              totalRemaining > 0 ? "text-destructive" : "text-foreground",
            )}
          >
            {formatIQD(totalRemaining)}
          </span>
        </div>
      </div>
    </div>
  );
}
