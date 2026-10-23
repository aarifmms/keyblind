import { NextResponse } from "next/server";
import { getOidcProviders } from "@/lib/oidc";

export async function GET() {
  const providers = getOidcProviders().map((p) => ({ id: p.id, name: p.name }));
  return NextResponse.json({ providers });
}
