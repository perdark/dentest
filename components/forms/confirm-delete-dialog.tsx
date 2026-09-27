"use client";

import { useActionState, useCallback, useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useActionToast, type ActionState } from "@/components/forms/use-action-toast";
import { FormError } from "@/components/forms/form-error";

/**
 * حذف سجل أُدخل بالخطأ — نافذة تأكيد واحدة لكل الشاشات، حتى يبدو الحذف ويتصرّف
 * بالطريقة نفسها أينما كان. الوصف يقول صراحةً ما الذي سيُحذف معه (الدفعات،
 * المواعيد…) قبل الضغط، والسطر المحذوف يبقى في «سجل التعديلات».
 */
export function ConfirmDeleteDialog({
  action,
  fields,
  title,
  description,
  successMessage,
  ariaLabel,
  triggerText,
  confirmText = "نعم، احذف",
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  /** Hidden inputs sent with the form (usually the record's id). */
  fields: Record<string, string | number>;
  title: string;
  description: ReactNode;
  successMessage: string;
  ariaLabel: string;
  /** Shown beside the icon; without it the trigger is an icon button. */
  triggerText?: string;
  confirmText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});

  useActionToast(
    state,
    successMessage,
    useCallback(() => setOpen(false), []),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          triggerText ? (
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive h-11 gap-1.5"
              aria-label={ariaLabel}
            />
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive size-11"
              aria-label={ariaLabel}
            />
          )
        }
      >
        <Trash2 className="size-4" />
        {triggerText}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription render={<div />} className="space-y-2">
            {description}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <FormError>{state.error}</FormError>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose render={<Button type="button" variant="outline" className="h-11" />}>
              تراجع
            </DialogClose>
            <Button type="submit" variant="destructive" className="h-11" disabled={pending}>
              {pending ? "جارٍ الحذف…" : confirmText}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
