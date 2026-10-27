"use client";

import { useEffect, useState } from "react";
import { CreditCard, Users, Shield, ArrowRight } from "lucide-react";

interface BillingData {
  plan: string;
  seatCount: number;
  seatLimit: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

const PLAN_LABEL: Record<string, string> = {
  free: "Free",
  team: "Team",
  enterprise: "Enterprise",
};

export default function BillingPage() {
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/org/billing")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Failed to load billing");
        setBilling(data.billing);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load billing"))
      .finally(() => setLoading(false));
  }, []);

  async function redirectTo(action: "checkout" | "portal") {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/org/billing/${action}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error || `Failed to ${action}`);
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0d1117] p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <CreditCard className="w-10 h-10 text-[#58a6ff] mx-auto mb-3" />
          <h1 className="text-xl font-semibold text-[#f0f6fc]">Billing</h1>
          <p className="text-sm text-[#8b949e] mt-1">Manage your organization plan</p>
        </div>

        <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6">
          {loading ? (
            <p className="text-sm text-[#8b949e] text-center">Loading…</p>
          ) : error && !billing ? (
            <p className="text-sm text-[#f85149] text-center">{error}</p>
          ) : billing ? (
            <>
              <div className="flex items-center justify-between mb-5">
                <span className="text-sm text-[#8b949e]">Plan</span>
                <span
                  className={
                    billing.plan === "free"
                      ? "text-xs px-2 py-0.5 rounded-full bg-[#30363d] text-[#c9d1d9]"
                      : "text-xs px-2 py-0.5 rounded-full bg-[#1f6feb]/20 text-[#58a6ff]"
                  }
                >
                  {PLAN_LABEL[billing.plan] ?? billing.plan}
                </span>
              </div>

              <div className="flex items-center gap-3 mb-6">
                <Users className="w-4 h-4 text-[#8b949e] shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-[#8b949e]">Members</p>
                  <p className="text-sm text-[#c9d1d9]">
                    {billing.seatCount} / {billing.seatLimit} seats
                  </p>
                </div>
              </div>

              {billing.plan === "free" ? (
                <button
                  onClick={() => redirectTo("checkout")}
                  disabled={busy}
                  className="w-full flex items-center justify-center gap-2 bg-[#1f6feb] text-white rounded-md py-2 text-sm font-medium hover:bg-[#388bfd] transition-colors disabled:opacity-60"
                >
                  {busy ? "Redirecting…" : "Upgrade to Team"}
                  {!busy && <ArrowRight className="w-4 h-4" />}
                </button>
              ) : (
                <button
                  onClick={() => redirectTo("portal")}
                  disabled={busy}
                  className="w-full flex items-center justify-center gap-2 border border-[#30363d] text-[#c9d1d9] rounded-md py-2 text-sm hover:bg-[#21262d] transition-colors disabled:opacity-60"
                >
                  <Shield className="w-4 h-4" />
                  {busy ? "Redirecting…" : "Manage subscription"}
                </button>
              )}

              {error && billing && <p className="text-xs text-[#f85149] mt-3">{error}</p>}
            </>
          ) : null}
        </div>

        <p className="text-center text-xs text-[#8b949e] mt-4">
          <a href="/dashboard" className="text-[#58a6ff] hover:underline">
            Back to dashboard
          </a>
        </p>
      </div>
    </div>
  );
}
