import { NextResponse } from "next/server";
import { verifySessionToken, setActiveOrgCookie } from "@/lib/auth";
import { getSession, revokeSession } from "@/lib/sessions";
import { getOidcProviders, getDiscovery, revokeToken } from "@/lib/oidc";

function readCookie(header: string, name: string): string {
  const found = header.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${name}=`));
  return found ? found.slice(name.length + 1) : "";
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const token = readCookie(req.headers.get("cookie") ?? "", "keyblind_token");

  let redirectTarget = new URL("/login", url.origin);
  let user = token ? await verifySessionToken(token) : null;
  if (user?.issuer) {
    const provider = getOidcProviders().find((p) => p.issuer === user!.issuer);
    if (provider) {
      try {
        const discovery = await getDiscovery(provider);
        const session = user.jti ? await getSession(user.jti) : null;

        if (session?.refreshToken && discovery.revocation_endpoint) {
          try {
            await revokeToken(provider, session.refreshToken);
          } catch {
            // best-effort; continue to local logout
          }
        }

        if (discovery.end_session_endpoint) {
          redirectTarget = new URL(discovery.end_session_endpoint);
          redirectTarget.searchParams.set("post_logout_redirect_uri", `${url.origin}/login`);
          redirectTarget.searchParams.set("client_id", provider.clientId);
          if (session?.idTokenHint) {
            redirectTarget.searchParams.set("id_token_hint", session.idTokenHint);
          }
        }
      } catch {
        // fall through to local logout
      }
    }
  }

  if (user?.jti) await revokeSession(user.jti);

  const res = NextResponse.redirect(redirectTarget, 303);
  res.cookies.set("keyblind_token", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  setActiveOrgCookie(res, null);
  return res;
}
