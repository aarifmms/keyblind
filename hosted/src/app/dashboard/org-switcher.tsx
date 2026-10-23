"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Plus } from "lucide-react";

export interface OrgOption {
  id: string;
  name: string;
  role: string;
}

export default function OrgSwitcher({
  orgs,
  activeOrgId,
}: {
  orgs: OrgOption[];
  activeOrgId: string | null;
}) {
  const router = useRouter();
  const [switching, setSwitching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  async function switchOrg(orgId: string) {
    if (!orgId || orgId === activeOrgId) return;
    setSwitching(true);
    setError("");
    try {
      const res = await fetch("/api/orgs/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to switch organization");
      }
    } catch {
      setError("Connection failed. Please try again.");
    } finally {
      setSwitching(false);
    }
  }

  async function createOrg(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.ok) {
        setName("");
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to create organization");
      }
    } catch {
      setError("Connection failed. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  if (orgs.length === 0) {
    return null;
  }

  return (
    <div className="w-full max-w-md mb-6">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Building2 className="w-4 h-4 text-[#8b949e] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <select
            value={activeOrgId ?? ""}
            onChange={(e) => switchOrg(e.target.value)}
            disabled={switching}
            className="w-full bg-[#161b22] border border-[#21262d] rounded-md pl-9 pr-3 py-2 text-sm text-[#c9d1d9] focus:outline-none focus:border-[#58a6ff] disabled:opacity-60 appearance-none"
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} ({o.role})
              </option>
            ))}
          </select>
        </div>
      </div>

      <form onSubmit={createOrg} className="flex items-center gap-2 mt-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New organization name"
          className="flex-1 bg-[#161b22] border border-[#21262d] rounded-md px-3 py-1.5 text-sm text-[#c9d1d9] focus:outline-none focus:border-[#58a6ff]"
        />
        <button
          type="submit"
          disabled={creating || !name.trim()}
          className="flex items-center gap-1 border border-[#30363d] text-[#c9d1d9] rounded-md px-3 py-1.5 text-sm hover:bg-[#21262d] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-3.5 h-3.5" />
          Create
        </button>
      </form>

      {error && <p className="text-xs text-[#f85149] mt-2">{error}</p>}
    </div>
  );
}
