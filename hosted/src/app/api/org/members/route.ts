import { NextResponse } from "next/server";
import { listMembers, inviteMember, getOrgBilling } from "@/lib/org";
import { requireOrgRole, ApiError } from "@/lib/org-auth";

export async function GET() {
  try {
    const { org } = await requireOrgRole(["owner", "admin", "member"]);
    const members = await listMembers(org.id);
    return NextResponse.json({ members });
  } catch (err) {
    if (!(err instanceof ApiError)) console.error("GET /api/org/members failed:", (err as Error).message);
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json({ error: err instanceof ApiError ? err.message : "Server error" }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const { org } = await requireOrgRole(["owner", "admin"]);
    const body = (await req.json().catch(() => ({}))) as { email?: string; name?: string };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email) throw new ApiError("Email is required", 400);
    const billing = await getOrgBilling(org.id);
    const members = await listMembers(org.id);
    const alreadyMember = members.some((m) => m.email === email);
    if (!alreadyMember && members.length >= billing.seatLimit) {
      throw new ApiError("Seat limit reached. Upgrade to Team to add more members.", 402);
    }
    const member = await inviteMember(org.id, email, typeof body.name === "string" ? body.name : undefined);
    return NextResponse.json({ member }, { status: 201 });
  } catch (err) {
    if (!(err instanceof ApiError)) console.error("POST /api/org/members failed:", (err as Error).message);
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json({ error: err instanceof ApiError ? err.message : "Server error" }, { status });
  }
}
