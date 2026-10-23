import { NextResponse } from "next/server";
import { getOrgBySlug } from "@/lib/org";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const org = await getOrgBySlug(slug);
    if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });
    return NextResponse.json({ orgId: org.id, name: org.name, publicKey: org.publicKey });
  } catch (err) {
    console.error("GET /api/org/well-known failed:", (err as Error).message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
