import { NextResponse } from "next/server";
import { setMemberRole, type Role } from "@/lib/org";
import { requireOrgRole, ApiError } from "@/lib/org-auth";

export async function PATCH(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { org } = await requireOrgRole(["owner"]);
    const { userId } = await params;
    const body = (await req.json().catch(() => ({}))) as { role?: string };
    const role = body.role;
    if (role !== "owner" && role !== "admin" && role !== "member") throw new ApiError("Invalid role", 400);
    await setMemberRole(org.id, userId, role as Role);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (!(err instanceof ApiError)) console.error("PATCH /api/org/members failed:", (err as Error).message);
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json({ error: err instanceof ApiError ? err.message : "Server error" }, { status });
  }
}
