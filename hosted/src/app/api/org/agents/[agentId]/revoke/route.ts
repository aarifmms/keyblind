import { NextResponse } from "next/server";
import { revokeAgent } from "@/lib/org";
import { requireOrgRole, ApiError } from "@/lib/org-auth";

export async function POST(req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  try {
    const { org, user } = await requireOrgRole(["owner", "admin"]);
    const { agentId } = await params;
    const body = (await req.json().catch(() => ({}))) as { reason?: string };
    await revokeAgent(org.id, agentId, typeof body.reason === "string" ? body.reason : "", user.userId!);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (!(err instanceof ApiError)) console.error("POST /api/org/agents/revoke failed:", (err as Error).message);
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json({ error: err instanceof ApiError ? err.message : "Server error" }, { status });
  }
}
