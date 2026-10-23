import { NextResponse } from "next/server";
import { listAgents, bindAgent } from "@/lib/org";
import { requireOrgRole, ApiError } from "@/lib/org-auth";

export async function GET() {
  try {
    const { org } = await requireOrgRole(["owner", "admin", "member"]);
    const agents = await listAgents(org.id);
    return NextResponse.json({ agents });
  } catch (err) {
    if (!(err instanceof ApiError)) console.error("GET /api/org/agents failed:", (err as Error).message);
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json({ error: err instanceof ApiError ? err.message : "Server error" }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const { org, user } = await requireOrgRole(["owner", "admin", "member"]);
    const body = (await req.json().catch(() => ({}))) as { agentId?: string; name?: string; publicKey?: string };
    const agentId = typeof body.agentId === "string" ? body.agentId.trim() : "";
    if (!agentId) throw new ApiError("agentId is required", 400);
    await bindAgent(org.id, user.userId!, agentId, body.name, body.publicKey);
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    if (!(err instanceof ApiError)) console.error("POST /api/org/agents failed:", (err as Error).message);
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json({ error: err instanceof ApiError ? err.message : "Server error" }, { status });
  }
}
