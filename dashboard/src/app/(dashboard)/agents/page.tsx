"use client";

import { useState, useEffect } from "react";
import { KeyblindClient } from "@/lib/keyblind-client";

export default function AgentsPage() {
  const [agents, setAgents] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [verification, setVerification] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [sponsor, setSponsor] = useState("");
  const [scope, setScope] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const client = new KeyblindClient();

  async function load() {
    try {
      const [agentsRes, ledgerRes] = await Promise.all([client.getAgents(), client.getAgentLedger()]);
      setAgents(agentsRes);
      setEntries(ledgerRes.entries || []);
      setVerification(ledgerRes.verification || null);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await client.registerAgent(name, sponsor, scope);
      setNewKey(res.privateKey);
      setName("");
      setSponsor("");
      setScope("");
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleExport(format: "json" | "csv") {
    try {
      const text = await client.exportLedger(format);
      const blob = new Blob([text], { type: format === "csv" ? "text/csv" : "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `agent-ledger.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Know Your Agent</h1>
        <div className="flex gap-2">
          <button
            onClick={() => handleExport("json")}
            className="px-3 py-1.5 text-xs rounded-md border border-[#21262d] text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d]"
          >
            Export JSON
          </button>
          <button
            onClick={() => handleExport("csv")}
            className="px-3 py-1.5 text-xs rounded-md border border-[#21262d] text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d]"
          >
            Export CSV
          </button>
        </div>
      </div>

      {verification && (
        <div
          className={`mb-6 px-4 py-3 rounded-md border text-sm ${
            verification.valid
              ? "bg-[#3fb950]/10 border-[#3fb950]/30 text-[#3fb950]"
              : "bg-[#f85149]/10 border-[#f85149]/30 text-[#f85149]"
          }`}
        >
          {verification.valid
            ? `Ledger intact — ${verification.entries} signed entries verified.`
            : `TAMPER DETECTED at entry #${verification.brokenAt}.`}
        </div>
      )}

      {error && (
        <div className="mb-4 px-4 py-3 rounded-md bg-[#f85149]/10 border border-[#f85149]/30 text-[#f85149] text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleRegister} className="mb-8 bg-[#161b22] border border-[#21262d] rounded-lg p-4 grid grid-cols-4 gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Agent name (e.g. billing-agent)"
          className="bg-[#0d1117] border border-[#21262d] rounded-md px-3 py-2 text-sm"
        />
        <input
          value={sponsor}
          onChange={(e) => setSponsor(e.target.value)}
          placeholder="Human sponsor (email)"
          className="bg-[#0d1117] border border-[#21262d] rounded-md px-3 py-2 text-sm"
        />
        <input
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          placeholder="Scope (e.g. read:invoices)"
          className="bg-[#0d1117] border border-[#21262d] rounded-md px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="bg-[#1f6feb] text-white rounded-md px-3 py-2 text-sm font-medium hover:bg-[#1a5fd0]"
        >
          Register Agent
        </button>
      </form>

      {newKey && (
        <div className="mb-8 bg-[#161b22] border border-[#f0883e]/30 rounded-lg p-4">
          <p className="text-sm text-[#f0883e] mb-2">
            Agent registered. Copy this private key now — it is shown once and signs this agent&apos;s actions:
          </p>
          <code className="block text-xs font-mono break-all bg-[#0d1117] border border-[#21262d] rounded-md p-3 text-[#c9d1d9]">
            {newKey}
          </code>
        </div>
      )}

      <h2 className="text-sm font-semibold text-[#8b949e] mb-3">Registered Agents</h2>
      {loading ? (
        <p className="text-sm text-[#8b949e]">Loading...</p>
      ) : agents.length === 0 ? (
        <p className="text-sm text-[#8b949e] mb-8">No agents registered yet.</p>
      ) : (
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden mb-8">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#21262d]">
                <th className="text-left p-3 text-[#8b949e] font-medium">Name</th>
                <th className="text-left p-3 text-[#8b949e] font-medium">Sponsor</th>
                <th className="text-left p-3 text-[#8b949e] font-medium">Scope</th>
                <th className="text-left p-3 text-[#8b949e] font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.id} className="border-b border-[#21262d] last:border-0">
                  <td className="p-3 font-mono text-xs">{a.name}</td>
                  <td className="p-3 text-xs text-[#8b949e]">{a.sponsor}</td>
                  <td className="p-3 text-xs text-[#8b949e]">{a.scope || "—"}</td>
                  <td className="p-3 text-xs text-[#8b949e]">{a.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="text-sm font-semibold text-[#8b949e] mb-3">Action Ledger</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-[#8b949e]">No actions recorded yet.</p>
      ) : (
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#21262d]">
                <th className="text-left p-3 text-[#8b949e] font-medium">#</th>
                <th className="text-left p-3 text-[#8b949e] font-medium">Agent</th>
                <th className="text-left p-3 text-[#8b949e] font-medium">Action</th>
                <th className="text-left p-3 text-[#8b949e] font-medium">Target</th>
                <th className="text-left p-3 text-[#8b949e] font-medium">Timestamp</th>
                <th className="text-left p-3 text-[#8b949e] font-medium">Hash</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.seq} className="border-b border-[#21262d] last:border-0">
                  <td className="p-3 text-xs text-[#8b949e]">{e.seq}</td>
                  <td className="p-3 text-xs text-[#8b949e]">{e.agentId.slice(0, 8)}</td>
                  <td className="p-3 font-mono text-xs">{e.action}</td>
                  <td className="p-3 font-mono text-xs">{e.target || "—"}</td>
                  <td className="p-3 text-xs text-[#8b949e]">{e.timestamp}</td>
                  <td className="p-3 font-mono text-xs text-[#8b949e]">{e.hash.slice(0, 16)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
