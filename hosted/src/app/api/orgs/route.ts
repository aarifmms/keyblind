import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { listOrgsForUser } from "@/lib/org";
import { ApiError } from "@/lib/org-auth";

export async function GET() {
  try {
    const session = await requireSession();
    if (!session.userId) throw new ApiError("Unauthorized", 401);
    const orgs = await listOrgsForUser(session.userId);
    return NextResponse.json({ orgs });
  } catch (err) {
    if (!(err instanceof ApiError)) console.error("GET /api/orgs failed:", (err as Error).message);
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json({ error: err instanceof ApiError ? err.message : "Server error" }, { status });
  }
}
