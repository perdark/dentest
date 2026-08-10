import Link from "next/link";
import { Phone, Search } from "lucide-react";
import { searchPatients } from "@/lib/queries";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PatientForm } from "./patient-form";

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const rows = searchPatients(q);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">المرضى</h1>
        <PatientForm />
      </div>

      <form method="get" className="flex gap-2">
        <div className="relative flex-1">
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
        <Button type="submit" variant="secondary" className="h-11">
          بحث
        </Button>
      </form>

      {rows.length === 0 ? (
        <div className="text-muted-foreground rounded-xl px-4 py-12 text-center ring-1 ring-foreground/10">
          {q ? "لا توجد نتائج مطابقة لبحثك." : "لا يوجد مرضى بعد. ابدأ بإضافة مريض."}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
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
                      <span className="text-muted-foreground">—</span>
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
