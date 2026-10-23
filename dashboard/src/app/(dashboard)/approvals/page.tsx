"use client";

import { useState, useEffect } from "react";
import { KeyblindClient } from "@/lib/keyblind-client";
import { RefreshCw, Check, X } from "lucide-react";

interface Approval {
  id: string;
  agentName: string;
  sponsor: string;
  action: string;
  target: string;
  status: "pending" | "approved" | "denied";
  requestedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
}

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const client = new KeyblindClient();

  async function load() {
    setError(null);
    try {
      const result = await client.getApprovals();
      setApprovals(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDecision(id: string, decision: "approve" | "deny") {
    setError(null);
    try {
      if (decision === "approve") await client.approveApproval(id);
      else await client.denyApproval(id);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  const pending = approvals.filter((a) => a.status === "pending");

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Approvals</h1>
        <button onClick={load} className="p-2 hover:bg-[#21262d] rounded-md" title="Refresh">
          <RefreshCw className="w-4 h-4 text-[#8b949e]" />
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-md bg-[#f85149]/10 border border-[#f85149]/30 text-[#f85149] text-sm">
          {error}
        </div>
      )}

      <p className="text-xs text-[#8b949e] mb-3">
        Agent-initiated writes that require human sign-off. Enable with{" "}
        <code className="font-mono">keyblind approvals require on</code> or per-secret with{" "}
        <code className="font-mono">keyblind approvals require &lt;secret&gt;</code>.
      </p>

      {loading ? (
        <p className="text-sm text-[#8b949e]">Loading...</p>
      ) : approvals.length === 0 ? (
        <p className="text-sm text-[#8b949e]">No approval requests yet.</p>
      ) : (
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#21262d]">
                <th className="text-left p-3 text-[#8b949e] font-medium">Agent</th>
                <th className="text-left p-3 text-[#8b949e] font-medium">Action</th>
                <th className="text-left p-3 text-[#8b949e] font-medium">Target</th>
                <th className="text-left p-3 text-[#8b949e] font-medium">Status</th>
                <th className="text-left p-3 text-[#8b949e] font-medium">Requested</th>
                <th className="text-right p-3 text-[#8b949e] font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {approvals.map((a) => (
                <tr key={a.id} className="border-b border-[#21262d] last:border-0">
                  <td className="p-3 text-xs">
                    <div className="font-medium">{a.agentName}</div>
                    {a.sponsor && <div className="text-[#8b949e] text-[11px]">{a.sponsor}</div>}
                  </td>
                  <td className="p-3 font-mono text-xs">{a.action}</td>
                  <td className="p-3 font-mono text-xs">{a.target}</td>
                  <td className="p-3 text-xs">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] ${
                        a.status === "pending"
                          ? "bg-[#d29922]/20 text-[#d29922]"
                          : a.status === "approved"
                          ? "bg-[#3fb950]/20 text-[#3fb950]"
                          : "bg-[#f85149]/20 text-[#f85149]"
                      }`}
                    >
                      {a.status}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-[#8b949e]">{a.requestedAt}</td>
                  <td className="p-3 text-right">
                    {a.status === "pending" ? (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleDecision(a.id, "approve")}
                          className="p-1.5 hover:bg-[#30363d] rounded"
                          title="Approve"
                        >
                          <Check className="w-3.5 h-3.5 text-[#3fb950]" />
                        </button>
                        <button
                          onClick={() => handleDecision(a.id, "deny")}
                          className="p-1.5 hover:bg-[#30363d] rounded"
                          title="Deny"
                        >
                          <X className="w-3.5 h-3.5 text-[#f85149]" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-[#8b949e]">
                        {a.decidedBy || ""}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && pending.length > 0 && (
        <p className="mt-3 text-xs text-[#d29922]">{pending.length} pending request(s) awaiting review.</p>
      )}
    </div>
  );
}
