import { cookies } from "next/headers";
import { requireSession, ORG_COOKIE, type SessionUser } from "./auth";
import { getOrgForUser, getOrgPlan, type OrgRow, type Role, type Plan } from "./org";

export class ApiError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export async function requireOrgRole(roles: Role[]): Promise<{ user: SessionUser; org: OrgRow; role: Role }> {
  let user: SessionUser;
  try {
    user = await requireSession();
  } catch {
    throw new ApiError("Unauthorized", 401);
  }
  if (!user.userId) throw new ApiError("Unauthorized", 401);

  const cookieStore = await cookies();
  const activeOrgId = cookieStore.get(ORG_COOKIE)?.value;
  const membership = await getOrgForUser(user.userId, activeOrgId || undefined);
  if (!membership) throw new ApiError("No organization", 404);
  if (!roles.includes(membership.role)) throw new ApiError("Forbidden", 403);

  return { user, org: membership.org, role: membership.role };
}

const PLAN_RANK: Record<Plan, number> = { free: 0, team: 1, enterprise: 2 };

// requireOrgRole + a plan gate. Reads the org's plan fresh from the DB (not the
// session JWT) so a plan change takes effect on the next request, not next login.
export async function requireOrgPlan(
  minPlan: Plan,
  roles: Role[] = ["owner", "admin", "member"],
): Promise<{ user: SessionUser; org: OrgRow; role: Role; plan: Plan }> {
  const { user, org, role } = await requireOrgRole(roles);
  const plan = await getOrgPlan(org.id);
  if (PLAN_RANK[plan] < PLAN_RANK[minPlan]) {
    throw new ApiError("Requires Team plan", 402);
  }
  return { user, org, role, plan };
}

// requireSession, but an auth failure surfaces as a 401 ApiError instead of the
// plain Error that requireSession throws. Used by org routes outside the
// middleware matcher (e.g. /api/orgs) that must return 401, not 500, when
// unauthenticated or revoked.
export async function requireUser(): Promise<SessionUser> {
  try {
    return await requireSession();
  } catch {
    throw new ApiError("Unauthorized", 401);
  }
}
