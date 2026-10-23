import { NextResponse } from "next/server";
import { listAgents } from "@/lib/org";
import { requireOrgRole, ApiError } from "@/lib/org-auth";
import { mintAgentToken } from "@/lib/agent-token";

export async function POST(req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  try {
    const { org, user, role } = await requireOrgRole(["owner", "admin", "member"]);
    const { agentId } = await params;
    const body = (await req.json().catch(() => ({}))) as { scope?: string; ttl?: number };
    const scope = typeof body.scope === "string" ? body.scope : "";
    const ttl = typeof body.ttl === "number" ? body.ttl : undefined;

    // Members may mint tokens only for their own agents; owner/admin for any.
    if (role !== "owner" && role !== "admin") {
      const agents = await listAgents(org.id);
      const owns = agents.some((a) => a.agentId === agentId && a.userId === user.userId);
      if (!owns) throw new ApiError("Forbidden", 403);
    }

    const token = await mintAgentToken(org.id, agentId, scope, ttl);
    return NextResponse.json({ token });
  } catch (err) {
    if (!(err instanceof ApiError)) console.error("POST /api/org/agents/token failed:", (err as Error).message);
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json({ error: err instanceof ApiError ? err.message : "Server error" }, { status });
  }
}
