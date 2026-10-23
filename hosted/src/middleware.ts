import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const token = req.cookies.get("keyblind_token")?.value;
  if (!token) return NextResponse.redirect(new URL("/login", req.url));

  const user = await verifySessionToken(token);
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
