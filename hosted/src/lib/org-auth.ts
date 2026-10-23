import { cookies } from "next/headers";
import { requireSession, ORG_COOKIE, type SessionUser } from "./auth";
import { getOrgForUser, type OrgRow, type Role } from "./org";

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
