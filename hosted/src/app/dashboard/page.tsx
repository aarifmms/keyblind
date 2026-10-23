import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Shield, LogOut, Mail, BadgeCheck, Calendar } from "lucide-react";
import { verifySessionToken, ORG_COOKIE } from "@/lib/auth";
import { listOrgsForUser } from "@/lib/org";
import OrgSwitcher from "./org-switcher";

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("keyblind_token")?.value;
  const user = token ? await verifySessionToken(token) : null;
  if (!user) redirect("/login");

  const orgs = user.userId ? await listOrgsForUser(user.userId) : [];
  const activeOrgCookie = cookieStore.get(ORG_COOKIE)?.value;
  const activeOrgId =
    orgs.find((m) => m.org.id === activeOrgCookie)?.org.id ?? orgs[0]?.org.id ?? null;

  const tierLabel =
    user.tier === "team" ? "Team" : user.tier === "pro" ? "Pro" : "Free";

  const isSso = user.authMethod === "sso";
  const rows = isSso
    ? [
        { icon: Mail, label: "Email", value: user.email },
        { icon: BadgeCheck, label: "Auth", value: "SSO" },
      ]
    : [
        { icon: Mail, label: "Email", value: user.email },
        { icon: BadgeCheck, label: "License", value: user.licenseId ?? "" },
        { icon: Calendar, label: "Expires", value: user.expiresAt ?? "" },
      ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0d1117] p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Shield className="w-10 h-10 text-[#58a6ff] mx-auto mb-3" />
          <h1 className="text-xl font-semibold text-[#f0f6fc]">Keyblind</h1>
          <p className="text-sm text-[#8b949e] mt-1">Your account</p>
        </div>

        <OrgSwitcher
          orgs={orgs.map((m) => ({ id: m.org.id, name: m.org.name, role: m.role }))}
          activeOrgId={activeOrgId}
        />

        <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6">
          <div className="flex items-center justify-between mb-5">
            <span className="text-sm text-[#8b949e]">Plan</span>
            <span
              className={
                user.tier === "free"
                  ? "text-xs px-2 py-0.5 rounded-full bg-[#30363d] text-[#c9d1d9]"
                  : "text-xs px-2 py-0.5 rounded-full bg-[#1f6feb]/20 text-[#58a6ff]"
              }
            >
              {tierLabel}
            </span>
          </div>

          <div className="space-y-3 mb-6">
            {rows.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-3">
                <Icon className="w-4 h-4 text-[#8b949e] shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-[#8b949e]">{label}</p>
                  <p className="text-sm text-[#c9d1d9] font-mono truncate">{value}</p>
                </div>
              </div>
            ))}
          </div>

          <form action={isSso ? "/api/auth/sso/logout" : "/api/auth/signout"} method="post">
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 border border-[#30363d] text-[#c9d1d9] rounded-md py-2 text-sm hover:bg-[#21262d] transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-[#8b949e] mt-4">
          Manage secrets from your terminal with{" "}
          <a href="https://keyblind.dev" className="text-[#58a6ff] hover:underline">
            Keyblind
          </a>
        </p>
      </div>
    </div>
  );
}
