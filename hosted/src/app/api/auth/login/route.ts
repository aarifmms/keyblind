import { NextResponse } from "next/server";
import { createSessionToken, SESSION_MAX_AGE } from "@/lib/auth";
import { verifyLicenseKey } from "@/lib/license";

export async function POST(req: Request) {
  try {
    const { licenseKey: raw } = await req.json();
    const licenseKey = typeof raw === "string" ? raw.trim() : "";

    if (!licenseKey) {
      return NextResponse.json({ error: "License key is required" }, { status: 401 });
    }

    // Validate Ed25519-signed license key (no accounts — the key is the identity)
    const info = verifyLicenseKey(licenseKey);
    if (!info) {
      return NextResponse.json({ error: "Invalid or expired license key" }, { status: 401 });
    }

    const token = await createSessionToken({
      email: info.email,
      tier: info.tier,
      licenseId: info.id,
      expiresAt: info.exp,
    });

    const res = NextResponse.json({
      success: true,
      email: info.email,
      tier: info.tier,
    });

    res.cookies.set("keyblind_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });

    return res;
  } catch (err) {
    console.error("Login failed:", (err as Error).message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
