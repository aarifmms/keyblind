import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireSession, setActiveOrgCookie, ORG_COOKIE } from "@/lib/auth";
import { createOrg, getOrgForUser, listOrgsForUser } from "@/lib/org";
import { ApiError } from "@/lib/org-auth";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const body = (await req.json().catch(() => ({}))) as { name?: string; slug?: string };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) throw new ApiError("Name is required", 400);
    const slug = (typeof body.slug === "string" && body.slug.trim()) || slugify(name);
    const org = await createOrg(name, slug, session.email);
    const res = NextResponse.json({ org }, { status: 201 });
    setActiveOrgCookie(res, org.id);
    return res;
  } catch (err) {
    if (!(err instanceof ApiError)) console.error("POST /api/org failed:", (err as Error).message);
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json({ error: err instanceof ApiError ? err.message : "Server error" }, { status });
  }
}

export async function GET() {
  try {
    const session = await requireSession();
    if (!session.userId) throw new ApiError("Unauthorized", 401);
    const cookieStore = await cookies();
    const activeOrgId = cookieStore.get(ORG_COOKIE)?.value;
    const membership = await getOrgForUser(session.userId, activeOrgId || undefined);
    if (!membership) throw new ApiError("No organization", 404);
    const orgs = await listOrgsForUser(session.userId);
    return NextResponse.json({ org: membership.org, role: membership.role, orgs });
  } catch (err) {
    if (!(err instanceof ApiError)) console.error("GET /api/org failed:", (err as Error).message);
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json({ error: err instanceof ApiError ? err.message : "Server error" }, { status });
  }
}
