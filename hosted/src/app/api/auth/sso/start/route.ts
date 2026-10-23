import { NextResponse } from "next/server";
import { getProvider, generateOidcState, buildAuthorizeUrl, signOidcState, codeChallengeFor } from "@/lib/oidc";

const STATE_COOKIE = "keyblind_oidc_state";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const providerId = url.searchParams.get("provider") ?? "";
    const provider = getProvider(providerId);
    if (!provider) {
      return NextResponse.redirect(new URL("/login?error=unknown-provider", url.origin), 303);
    }

    const redirectAfter = url.searchParams.get("redirect") || "/dashboard";
    const oidcState = generateOidcState(providerId, redirectAfter);
    const codeChallenge = codeChallengeFor(oidcState.codeVerifier);
    const redirectUri = `${url.origin}/api/auth/sso/callback`;
    const authorizeUrl = await buildAuthorizeUrl(provider, oidcState.state, oidcState.nonce, codeChallenge, redirectUri);

    const stateToken = await signOidcState(oidcState);
    const res = NextResponse.redirect(authorizeUrl, 302);
    res.cookies.set(STATE_COOKIE, stateToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 5,
    });
    return res;
  } catch (err) {
    console.error("SSO start failed:", (err as Error).message);
    return NextResponse.redirect(new URL("/login?error=sso-start", new URL(req.url).origin), 303);
  }
}
