"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import { SubmitButton } from "@/components/forms/submit-button";
import { savePrices, type PricesState } from "@/lib/actions/prices";

type PriceRow = {
  id: number;
  nameAr: string;
  defaultPrice: number;
  isPlaceholder: boolean | null;
};

export function PricesForm({ types }: { types: PriceRow[] }) {
  const [state, formAction] = useActionState<PricesState, FormData>(savePrices, {});
  const seen = useRef<PricesState | null>(null);

  useEffect(() => {
    if (state === seen.current) return;
    seen.current = state;
    if (state.ok) toast.success(`تم حفظ ${state.saved ?? 0} سعر`);
  }, [state]);

  return (
    <form action={formAction}>
      <Card>
        <CardHeader>
          <CardTitle>الأسعار حسب نوع العلاج</CardTitle>
          <CardDescription>عدّل السعر ثم احفظ. كل المبالغ بالدينار العراقي.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="ps-(--card-spacing)">نوع العلاج</TableHead>
                <TableHead className="pe-(--card-spacing)">السعر (د.ع)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {types.map((t) => {
                const placeholder = t.isPlaceholder !== false;
                return (
                  <TableRow key={t.id}>
                    <TableCell className="ps-(--card-spacing) font-medium">
                      <div className="flex items-center gap-2">
                        <span>{t.nameAr}</span>
                        {placeholder ? <Badge variant="secondary">مبدئي</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell className="pe-(--card-spacing)">
                      <Input
                        name={`price_${t.id}`}
                        defaultValue={t.defaultPrice}
                        inputMode="numeric"
                        dir="ltr"
                        autoComplete="off"
                        aria-label={`سعر ${t.nameAr}`}
                        className="money h-11 w-36 text-start"
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
        <CardFooter className="flex flex-wrap items-center gap-3">
          {state.error ? (
            <p role="alert" className="text-destructive me-auto text-sm">
              {state.error}
            </p>
          ) : null}
          <SubmitButton className="h-11 w-full sm:ms-auto sm:w-auto">
            حفظ الأسعار
          </SubmitButton>
        </CardFooter>
      </Card>
    </form>
  );
}
