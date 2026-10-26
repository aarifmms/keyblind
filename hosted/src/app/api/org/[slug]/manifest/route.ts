import { NextResponse } from "next/server";
import { getOrgBySlug, listRevocations, listGroups, computeAgentScopes } from "@/lib/org";
import { buildManifest, computeManifestVersion } from "@/lib/manifest";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const org = await getOrgBySlug(slug);
    if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });

    const [denyList, groups, agentScopes] = await Promise.all([
      listRevocations(org.id),
      listGroups(org.id),
      computeAgentScopes(org.id),
    ]);
    const version = computeManifestVersion(denyList, groups, agentScopes);

    const ifNoneMatch = req.headers.get("if-none-match");
    if (ifNoneMatch && ifNoneMatch === version) {
      return new NextResponse(null, { status: 304, headers: { ETag: version } });
    }

    const manifest = await buildManifest(org.id);
    return new NextResponse(manifest, {
      headers: { "content-type": "application/json", ETag: version },
    });
  } catch (err) {
    console.error("GET /api/org/manifest failed:", (err as Error).message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
