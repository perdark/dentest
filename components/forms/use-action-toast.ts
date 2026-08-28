"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

export interface ActionState {
  ok?: boolean;
  error?: string;
}

/**
 * Confirm a finished server action to the person who ran it.
 *
 * Every save in this app used to end in silence: the dialog closed, the row
 * appeared somewhere below the fold, and staff coming off paper notebooks had
 * no way to tell a saved record from a lost one. The safe assumption in that
 * situation is "it didn't work", so the same patient gets entered twice.
 *
 * Fires once per completed action. `useActionState` hands back a brand-new
 * state object for every run — even two identical saves — so comparing object
 * identity is what separates "the action just finished" from "this component
 * re-rendered for some other reason". Comparing `state.ok` instead would toast
 * again on every unrelated render.
 *
 * `onSuccess` is where closing a dialog or refreshing the route belongs, so a
 * screen never has two competing effects watching the same state.
 *
 * `toastError` is for the forms that have nowhere to print a failure: an icon
 * button sitting in a table row («حضر», «حذف تسجيل المختبر») has no space under
 * it for `state.error`, so those actions used to fail in complete silence — the
 * row simply did not change. Forms with a visible <FormError> leave this off,
 * or the same failure would be reported twice.
 */
export function useActionToast<S extends ActionState>(
  state: S,
  message: string | ((state: S) => string),
  onSuccess?: () => void,
  options?: { toastError?: boolean },
): void {
  const seen = useRef<S | null>(null);
  const toastError = options?.toastError ?? false;

  useEffect(() => {
    // Includes the initial `{}` — it is "seen" without being a result.
    if (state === seen.current) return;
    seen.current = state;
    if (!state.ok) {
      if (toastError && state.error) toast.error(state.error);
      return;
    }
    toast.success(typeof message === "function" ? message(state) : message);
    onSuccess?.();
  }, [state, message, onSuccess, toastError]);
}
