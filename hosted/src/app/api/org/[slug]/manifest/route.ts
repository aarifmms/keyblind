import { NextResponse } from "next/server";
import { getOrgBySlug } from "@/lib/org";
import { buildManifest } from "@/lib/manifest";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const org = await getOrgBySlug(slug);
    if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });
    const manifest = await buildManifest(org.id);
    return new NextResponse(manifest, {
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    console.error("GET /api/org/manifest failed:", (err as Error).message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
