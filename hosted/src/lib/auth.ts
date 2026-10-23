import * as jose from "jose";
import { cookies } from "next/headers";

function getSecret(): Uint8Array {
  const secret =
    process.env.JWT_SECRET ||
    (process.env.NODE_ENV === "production" ? "" : "keyblind-dashboard-dev-secret-change-in-production");
  if (!secret) throw new Error("JWT_SECRET must be set in production");
  return new TextEncoder().encode(secret);
}

// 30-day session so users don't re-enter their license key daily
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export interface SessionUser {
  email: string;
  tier: string;
  licenseId?: string;
  expiresAt?: string;
  userId?: string;
  orgId?: string;
  role?: string;
  authMethod?: "license" | "sso";
  oidcSub?: string;
  issuer?: string;
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new jose.SignJWT(user as unknown as jose.JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jose.jwtVerify(token, getSecret());
    return payload as unknown as SessionUser;
  } catch {
    return null;
  }
}

// Reads the session from the request cookie and verifies it. Throws if there is
// no valid session, so a route can `const user = await requireSession()`.
export async function requireSession(): Promise<SessionUser> {
  const cookieStore = await cookies();
  const token = cookieStore.get("keyblind_token")?.value;
  if (!token) throw new Error("Unauthorized");
  const user = await verifySessionToken(token);
  if (!user) throw new Error("Unauthorized");
  return user;
}
