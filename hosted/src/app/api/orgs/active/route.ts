import { NextResponse } from "next/server";
import { setActiveOrgCookie } from "@/lib/auth";
import { getOrgForUser } from "@/lib/org";
import { ApiError, requireUser } from "@/lib/org-auth";

export async function POST(req: Request) {
  try {
    const session = await requireUser();
    if (!session.userId) throw new ApiError("Unauthorized", 401);
    const body = (await req.json().catch(() => ({}))) as { orgId?: string };
    const orgId = typeof body.orgId === "string" ? body.orgId : "";
    if (!orgId) throw new ApiError("orgId is required", 400);
    const membership = await getOrgForUser(session.userId, orgId);
    if (!membership) throw new ApiError("No organization", 404);
    const res = NextResponse.json({ org: membership.org, role: membership.role });
    setActiveOrgCookie(res, membership.org.id);
    return res;
  } catch (err) {
    if (!(err instanceof ApiError)) console.error("POST /api/orgs/active failed:", (err as Error).message);
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json({ error: err instanceof ApiError ? err.message : "Server error" }, { status });
  }
}
