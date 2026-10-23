import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public org endpoints. The Ed25519 signature over the manifest is the
  // authenticity gate — local machines hold no hosted session, so these cannot
  // be cookie-gated.
  if (/^\/api\/org\/[^/]+\/(well-known|manifest)$/.test(pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get("keyblind_token")?.value;
  const user = token ? await verifySessionToken(token) : null;

  if (!user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/org/:path*"],
};
