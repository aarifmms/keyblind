import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { isSessionRevoked } from "./sessions";
import {
  createSessionToken,
  verifySessionToken,
  SESSION_MAX_AGE,
  type SessionUser,
} from "./auth-token";

export { createSessionToken, verifySessionToken, SESSION_MAX_AGE, type SessionUser };

export const ORG_COOKIE = "keyblind_org";

// Sets (or clears, when orgId is null) the active-org cookie. The id is only a
// hint — every request validates it against org_members in requireOrgRole.
export function setActiveOrgCookie(res: NextResponse, orgId: string | null): void {
  res.cookies.set(ORG_COOKIE, orgId ?? "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: orgId ? SESSION_MAX_AGE : 0,
  });
}

// Reads the session from the request cookie and verifies it. Throws if there is
// no valid session, so a route can `const user = await requireSession()`.
export async function requireSession(): Promise<SessionUser> {
  const cookieStore = await cookies();
  const token = cookieStore.get("keyblind_token")?.value;
  if (!token) throw new Error("Unauthorized");
  const user = await verifySessionToken(token);
  if (!user) throw new Error("Unauthorized");
  if (user.jti && (await isSessionRevoked(user.jti))) throw new Error("Unauthorized");
  return user;
}
