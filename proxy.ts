import { NextResponse, type NextRequest } from "next/server";

// Next 16 "proxy" (formerly middleware). Lightweight redirect guard — presence
// check only. Real cryptographic session verification is in the (app) layout
// via requireAuth(), so security does not depend on this running.
export function proxy(req: NextRequest) {
  if (!req.cookies.has("zuha_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|_next|api|favicon.ico|.*\\..*).*)"],
};
