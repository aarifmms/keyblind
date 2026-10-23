import { NextResponse } from "next/server";
import { unrevokeAgent } from "@/lib/org";
import { requireOrgRole, ApiError } from "@/lib/org-auth";

export async function POST(_req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  try {
    const { org } = await requireOrgRole(["owner", "admin"]);
    const { agentId } = await params;
    await unrevokeAgent(org.id, agentId);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (!(err instanceof ApiError)) console.error("POST /api/org/agents/unrevoke failed:", (err as Error).message);
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json({ error: err instanceof ApiError ? err.message : "Server error" }, { status });
  }
}
