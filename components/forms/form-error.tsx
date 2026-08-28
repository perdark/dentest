import { AlertCircle } from "lucide-react";

/**
 * رسالة خطأ نموذج — سطر واحد يظهر فوق زر الحفظ.
 *
 * كل نموذج في التطبيق كان يطبع خطأ الخادم في `<p className="text-destructive
 * text-sm">`: أربعة عشر بكسل، أحمر، بلا علامة أخرى. من يقرأ الشاشة بعين ضعيفة
 * قد لا يرى فرقاً بين السطر وبين بقية النص، فيضغط «حفظ» مرة ثانية ظاناً أن
 * الضغطة الأولى لم تصل. اللون وحده لا يكفي هنا: العلامة والحجم يحملان الرسالة
 * أيضاً، و`role="alert"` يُسمِعها لقارئ الشاشة فور وصولها.
 */
export function FormError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="text-destructive flex items-start gap-2 text-base font-medium"
    >
      <AlertCircle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
