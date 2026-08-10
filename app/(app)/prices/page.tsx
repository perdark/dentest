import { Info } from "lucide-react";
import type { Metadata } from "next";
import { listTreatmentTypes } from "@/lib/queries";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PricesForm } from "./prices-form";

export const metadata: Metadata = { title: "قائمة الأسعار" };

export default function PricesPage() {
  const types = listTreatmentTypes();
  // A missing price row (null) is treated as unset → still a placeholder.
  const hasPlaceholder = types.some((t) => t.isPlaceholder !== false);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">قائمة الأسعار</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          السعر الافتراضي لكل نوع علاج بالدينار العراقي. يُقترح تلقائياً عند فتح حالة جديدة.
        </p>
      </div>

      {hasPlaceholder ? (
        <Alert>
          <Info />
          <AlertTitle>أسعار مبدئية</AlertTitle>
          <AlertDescription>
            هذه أسعار مبدئية — استبدلها بقائمة العيادة الرسمية.
          </AlertDescription>
        </Alert>
      ) : null}

      <PricesForm
        types={types.map((t) => ({
          id: t.id,
          nameAr: t.nameAr,
          defaultPrice: t.defaultPrice,
          isPlaceholder: t.isPlaceholder,
        }))}
      />
    </div>
  );
}
