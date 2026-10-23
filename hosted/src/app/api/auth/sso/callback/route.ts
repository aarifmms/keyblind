import { NextResponse } from "next/server";
import { getProvider, exchangeCode, verifyIdToken, verifyOidcState } from "@/lib/oidc";
import { createSessionToken, setActiveOrgCookie, SESSION_MAX_AGE } from "@/lib/auth";
import { createSession } from "@/lib/sessions";
import { findOrCreateUserByIdentity, getOrgForUser, applySsoGroupMapping, provisionSsoUser } from "@/lib/org";

const STATE_COOKIE = "keyblind_oidc_state";

function extractGroups(payload: Record<string, unknown>, claim: string): string[] {
  const value = payload[claim];
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (typeof value === "string") return [value];
  return [];
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const redirectTo = (target: string) => NextResponse.redirect(new URL(target, url.origin), 303);

  try {
    const providerId = url.searchParams.get("provider") ?? "";
    const code = url.searchParams.get("code") ?? "";
    const state = url.searchParams.get("state") ?? "";
    const provider = getProvider(providerId);
    if (!provider || !code || !state) return redirectTo("/login?error=sso-callback");

    const cookieHeader = req.headers.get("cookie") ?? "";
    const stateCookie = cookieHeader
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${STATE_COOKIE}=`));
    const stateToken = stateCookie ? stateCookie.slice(STATE_COOKIE.length + 1) : "";
    const oidcState = stateToken ? await verifyOidcState(stateToken) : null;
    if (!oidcState || oidcState.provider !== providerId || oidcState.state !== state) {
      return redirectTo("/login?error=sso-state");
    }

    const { idToken, refreshToken } = await exchangeCode(provider, code, oidcState.codeVerifier, `${url.origin}/api/auth/sso/callback`);
    const claims = await verifyIdToken(provider, idToken, oidcState.nonce);

    const email = String(claims.email).trim().toLowerCase();
    if (provider.allowedDomains && provider.allowedDomains.length > 0) {
      const domain = email.slice(email.lastIndexOf("@") + 1);
      if (!provider.allowedDomains.includes(domain)) {
        return redirectTo("/login?error=sso-domain");
      }
    }

    const name = typeof claims.name === "string" ? claims.name : undefined;
    const user = await findOrCreateUserByIdentity(provider.issuer, String(claims.sub), email, name);

    const groupsClaim = provider.groupsClaim || "groups";
    const groups = extractGroups(claims, groupsClaim);

    let membership = await getOrgForUser(user.id);
    if (!membership && provider.orgSlug) {
      membership = await provisionSsoUser(user.id, user.email, groups, {
        orgSlug: provider.orgSlug,
        autoProvision: provider.autoProvision,
        ownerGroup: provider.ownerGroup,
        adminGroup: provider.adminGroup,
      });
    }
    if (membership && groups.length > 0) {
      await applySsoGroupMapping(user.id, membership.org.id, groups, {
        ownerGroup: provider.ownerGroup,
        adminGroup: provider.adminGroup,
      });
    }

    const sid = typeof claims.sid === "string" ? claims.sid : undefined;
    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000).toISOString();
    const jti = await createSession({
      userId: user.id,
      issuer: provider.issuer,
      sub: String(claims.sub),
      sid,
      idTokenHint: idToken,
      refreshToken,
      expiresAt,
    });

    const token = await createSessionToken({
      email: user.email,
      tier: "team",
      userId: user.id,
      orgId: membership?.org.id,
      role: membership?.role,
      authMethod: "sso",
      oidcSub: String(claims.sub),
      issuer: provider.issuer,
      jti,
    });

    const res = redirectTo(oidcState.redirectAfter || "/dashboard");
    res.cookies.set("keyblind_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    setActiveOrgCookie(res, membership?.org.id ?? null);
    res.cookies.set(STATE_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return res;
  } catch (err) {
    console.error("SSO callback failed:", (err as Error).message);
    return redirectTo("/login?error=sso-callback");
  }
}
