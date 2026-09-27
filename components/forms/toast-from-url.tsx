"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";

/**
 * رسالة تأكيد لعملية انتهت بالانتقال إلى صفحة أخرى.
 *
 * حذف مريض يُنهي صفحته نفسها، فلا يبقى مكوّن يعرض «تم الحذف» — الخادم ينقل
 * إلى القائمة مع علامة في الرابط، وهذا المكوّن يعرض الرسالة مرة واحدة ثم يمسح
 * العلامة حتى لا تعود عند التحديث.
 */
export function ToastFromUrl({ message }: { message: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const shown = useRef(false);

  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    toast.success(message);
    router.replace(pathname);
  }, [message, pathname, router]);

  return null;
}
