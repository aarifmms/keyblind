import { NextResponse } from "next/server";
import { listGroups, createGroup } from "@/lib/org";
import { requireOrgPlan, ApiError } from "@/lib/org-auth";

export async function GET() {
  try {
    const { org } = await requireOrgPlan("team");
    const groups = await listGroups(org.id);
    return NextResponse.json({ groups });
  } catch (err) {
    if (!(err instanceof ApiError)) console.error("GET /api/org/groups failed:", (err as Error).message);
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json({ error: err instanceof ApiError ? err.message : "Server error" }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const { org } = await requireOrgPlan("team", ["owner", "admin"]);
    const body = (await req.json().catch(() => ({}))) as { name?: string; scope?: string };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) throw new ApiError("Name is required", 400);
    const scope = typeof body.scope === "string" ? body.scope.trim() : "";
    const group = await createGroup(org.id, name, scope);
    return NextResponse.json({ group }, { status: 201 });
  } catch (err) {
    if (!(err instanceof ApiError)) console.error("POST /api/org/groups failed:", (err as Error).message);
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json({ error: err instanceof ApiError ? err.message : "Server error" }, { status });
  }
}
