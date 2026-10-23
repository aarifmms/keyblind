import { NextResponse } from "next/server";
import * as jose from "jose";
import { getOidcProviders, verifyLogoutToken } from "@/lib/oidc";
import { revokeSessionsByIdp } from "@/lib/sessions";

// OIDC Back-Channel Logout. Public (outside the middleware matcher): the IdP
// calls this directly with a signed logout_token, no browser session involved.
export async function POST(req: Request) {
  const form = await req.formData().catch(() => new FormData());
  const raw = form.get("logout_token");
  const token = typeof raw === "string" ? raw : "";

  if (!token) {
    return NextResponse.json({ error: "logout_token is required" }, { status: 400 });
  }

  let issuer = "";
  try {
    issuer = String(jose.decodeJwt(token).iss ?? "");
  } catch {
    // invalid token shape — rejected below
  }

  const provider = getOidcProviders().find((p) => p.issuer === issuer);
  if (!provider) {
    return NextResponse.json({ error: "Unknown issuer" }, { status: 400 });
  }

  try {
    const { sub, sid } = await verifyLogoutToken(provider, token);
    await revokeSessionsByIdp(provider.issuer, sub, sid);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Backchannel logout failed:", (err as Error).message);
    return NextResponse.json({ error: "Invalid logout_token" }, { status: 400 });
  }
}
