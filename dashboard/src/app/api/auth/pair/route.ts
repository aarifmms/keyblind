import { NextResponse } from "next/server";
import { createSessionToken, SESSION_MAX_AGE } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const { tier, email } = await req.json();

    if (!tier) {
      return NextResponse.json({ error: "tier required" }, { status: 400 });
    }

    const token = await createSessionToken({
      email: email || "vault-user@localhost",
      tier,
      licenseId: "paired",
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const res = NextResponse.json({ success: true });
    res.cookies.set("keyblind_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE,
    });

    return res;
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
