import { NextResponse } from "next/server";
import { addGroupMember } from "@/lib/org";
import { requireOrgRole, ApiError } from "@/lib/org-auth";

export async function POST(req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const { org } = await requireOrgRole(["owner", "admin"]);
    const { groupId } = await params;
    const body = (await req.json().catch(() => ({}))) as { userId?: string };
    const userId = typeof body.userId === "string" ? body.userId : "";
    if (!userId) throw new ApiError("userId is required", 400);
    await addGroupMember(org.id, groupId, userId);
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    if (!(err instanceof ApiError)) console.error("POST /api/org/groups/members failed:", (err as Error).message);
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json({ error: err instanceof ApiError ? err.message : "Server error" }, { status });
  }
}
