import { NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth";
import { getOidcProviders, getDiscovery } from "@/lib/oidc";

function readCookie(header: string, name: string): string {
  const found = header.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${name}=`));
  return found ? found.slice(name.length + 1) : "";
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const token = readCookie(req.headers.get("cookie") ?? "", "keyblind_token");

  let redirectTarget = new URL("/login", url.origin);
  if (token) {
    const user = await verifySessionToken(token);
    if (user?.issuer) {
      const provider = getOidcProviders().find((p) => p.issuer === user.issuer);
      if (provider) {
        try {
          const discovery = await getDiscovery(provider);
          if (discovery.end_session_endpoint) {
            redirectTarget = new URL(discovery.end_session_endpoint);
            redirectTarget.searchParams.set("post_logout_redirect_uri", `${url.origin}/login`);
          }
        } catch {
          // fall through to local logout
        }
      }
    }
  }

  const res = NextResponse.redirect(redirectTarget, 303);
  res.cookies.set("keyblind_token", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
