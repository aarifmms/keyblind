import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET must be set in production");
    }
    return "keyblind-dashboard-dev-secret-change-in-production";
  }
  return secret;
}

const SECRET = new TextEncoder().encode(getJwtSecret());

const PUBLIC_PATHS = ["/login", "/activate", "/connect"];

export async function middleware(req: NextRequest) {
  const token = req.cookies.get("keyblind_token")?.value;
  const pathname = req.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith("/api/auth/"));

  if (!token && !isPublic) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (token && pathname === "/login") {
    try {
      await jwtVerify(token, SECRET);
      return NextResponse.redirect(new URL("/", req.url));
    } catch {
      // Invalid token, stay on login
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|api|favicon.ico).*)"],
};
