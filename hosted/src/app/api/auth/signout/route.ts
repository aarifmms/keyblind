import { NextResponse } from "next/server";
import { setActiveOrgCookie } from "@/lib/auth";

export async function POST(req: Request) {
  const res = NextResponse.redirect(new URL("/login", req.url), 303);
  res.cookies.set("keyblind_token", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  setActiveOrgCookie(res, null);
  return res;
}
