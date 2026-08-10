"use server";

import { redirect } from "next/navigation";
import { destroySession } from "@/lib/auth";
import { requireAuth } from "@/lib/auth";

export async function logoutAction(): Promise<void> {
  await requireAuth();
  await destroySession();
  redirect("/login");
}
