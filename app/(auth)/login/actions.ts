"use server";

import { redirect } from "next/navigation";
import { verifyPin } from "@/lib/crypto";
import { getSettings } from "@/lib/server-utils";
import { createSession } from "@/lib/auth";
import {
  attemptsRemaining,
  lockoutRemainingSeconds,
  registerFailedLogin,
  resetLoginAttempts,
} from "@/lib/rate-limit";

export type LoginState = { error?: string };

function waitMessage(seconds: number): string {
  if (seconds >= 60) {
    const minutes = Math.ceil(seconds / 60);
    return `محاولات كثيرة خاطئة. انتظر ${minutes} دقيقة قبل المحاولة مجدداً.`;
  }
  return `محاولات كثيرة خاطئة. انتظر ${seconds} ثانية قبل المحاولة مجدداً.`;
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  // البوابة تُفحص قبل أي تحقّق حتى لا يمكن تجريب الأرقام بلا حدّ. [E1]
  const locked = lockoutRemainingSeconds();
  if (locked > 0) return { error: waitMessage(locked) };

  const pin = String(formData.get("pin") ?? "").trim();
  if (!pin) return { error: "أدخل رمز الدخول" };

  const s = getSettings();
  if (!verifyPin(pin, s.pinHash)) {
    const wait = registerFailedLogin();
    if (wait > 0) return { error: waitMessage(wait) };
    const left = attemptsRemaining();
    return {
      error: `رمز الدخول غير صحيح. المحاولات المتبقية: ${left}`,
    };
  }

  resetLoginAttempts();
  await createSession();
  redirect("/dashboard");
}
