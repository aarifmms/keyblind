import { NextResponse } from "next/server";
import { getOrgBilling } from "@/lib/org";
import { requireOrgRole, ApiError } from "@/lib/org-auth";

export async function GET() {
  try {
    const { org } = await requireOrgRole(["owner", "admin", "member"]);
    const billing = await getOrgBilling(org.id);
    return NextResponse.json({ billing });
  } catch (err) {
    if (!(err instanceof ApiError)) console.error("GET /api/org/billing failed:", (err as Error).message);
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json({ error: err instanceof ApiError ? err.message : "Server error" }, { status });
  }
}
