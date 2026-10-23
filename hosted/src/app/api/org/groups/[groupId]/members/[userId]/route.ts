import { NextResponse } from "next/server";
import { removeGroupMember } from "@/lib/org";
import { requireOrgRole, ApiError } from "@/lib/org-auth";

export async function DELETE(_req: Request, { params }: { params: Promise<{ groupId: string; userId: string }> }) {
  try {
    const { org } = await requireOrgRole(["owner", "admin"]);
    const { groupId, userId } = await params;
    await removeGroupMember(org.id, groupId, userId);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (!(err instanceof ApiError)) console.error("DELETE /api/org/groups/members failed:", (err as Error).message);
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json({ error: err instanceof ApiError ? err.message : "Server error" }, { status });
  }
}
