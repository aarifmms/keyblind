"use client";

import { useState, useEffect } from "react";
import { KeyblindClient } from "@/lib/keyblind-client";
import { RefreshCw, Save, X } from "lucide-react";

interface Reminder {
  name: string;
  updatedAt: string;
  ageDays: number;
}

export default function PoliciesPage() {
  const [secrets, setSecrets] = useState<string[]>([]);
  const [policies, setPolicies] = useState<{ secret: string; policy: string }[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const client = new KeyblindClient();

  async function load() {
    try {
      const [names, pols, rem] = await Promise.all([
        client.getSecrets(),
        client.getPolicies(),
        client.getRotationNeeded(90),
      ]);
      setSecrets(names);
      setPolicies(pols);
      setReminders(rem);
      const policyMap: Record<string, string> = {};
      for (const p of pols) policyMap[p.secret] = p.policy;
      setDrafts(policyMap);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleRotate(name: string) {
    setError(null);
    try {
      await client.rotateSecret(name);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleSavePolicy(secret: string) {
    setError(null);
    try {
      const policy = (drafts[secret] || "").trim();
      if (policy) await client.setPolicy(secret, policy);
      else await client.clearPolicy(secret);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleClearPolicy(secret: string) {
    setError(null);
    try {
      await client.clearPolicy(secret);
      setDrafts((d) => ({ ...d, [secret]: "" }));
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Policies &amp; Rotation</h1>
        <button onClick={load} className="p-2 hover:bg-[#21262d] rounded-md" title="Refresh">
          <RefreshCw className="w-4 h-4 text-[#8b949e]" />
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-md bg-[#f85149]/10 border border-[#f85149]/30 text-[#f85149] text-sm">
          {error}
        </div>
      )}

      <h2 className="text-sm font-semibold text-[#8b949e] mb-3">Rotation Reminders</h2>
      {loading ? (
        <p className="text-sm text-[#8b949e] mb-8">Loading...</p>
      ) : reminders.length === 0 ? (
        <p className="text-sm text-[#8b949e] mb-8">All secrets rotated within 90 days.</p>
      ) : (
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden mb-8">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#21262d]">
                <th className="text-left p-3 text-[#8b949e] font-medium">Secret</th>
                <th className="text-left p-3 text-[#8b949e] font-medium">Age</th>
                <th className="text-left p-3 text-[#8b949e] font-medium">Last updated</th>
                <th className="text-right p-3 text-[#8b949e] font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {reminders.map((r) => (
                <tr key={r.name} className="border-b border-[#21262d] last:border-0 hover:bg-[#21262d]/50">
                  <td className="p-3 font-mono text-xs">{r.name}</td>
                  <td className="p-3 text-xs text-[#f0883e]">{r.ageDays}d</td>
                  <td className="p-3 text-xs text-[#8b949e]">{r.updatedAt}</td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => handleRotate(r.name)}
                      className="px-3 py-1.5 text-xs rounded-md border border-[#21262d] text-[#58a6ff] hover:bg-[#21262d]"
                    >
                      Rotate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="text-sm font-semibold text-[#8b949e] mb-3">Per-secret Policies</h2>
      <p className="text-xs text-[#8b949e] mb-3">
        Restrict which agents may read or write a secret by agent name (e.g.{" "}
        <code className="font-mono">read:billing-*</code>, <code className="font-mono">*</code>). Empty means no
        per-secret restriction.
      </p>
      {loading ? (
        <p className="text-sm text-[#8b949e]">Loading...</p>
      ) : secrets.length === 0 ? (
        <p className="text-sm text-[#8b949e]">No secrets stored yet.</p>
      ) : (
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#21262d]">
                <th className="text-left p-3 text-[#8b949e] font-medium">Secret</th>
                <th className="text-left p-3 text-[#8b949e] font-medium">Policy</th>
                <th className="text-right p-3 text-[#8b949e] font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {secrets.map((name) => (
                <tr key={name} className="border-b border-[#21262d] last:border-0">
                  <td className="p-3 font-mono text-xs align-middle">{name}</td>
                  <td className="p-3">
                    <input
                      value={drafts[name] ?? ""}
                      onChange={(e) => setDrafts((d) => ({ ...d, [name]: e.target.value }))}
                      placeholder="e.g. read:billing-*"
                      className="w-full bg-[#0d1117] border border-[#21262d] rounded-md px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-[#58a6ff]"
                    />
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleSavePolicy(name)}
                        className="p-1.5 hover:bg-[#30363d] rounded"
                        title="Save policy"
                      >
                        <Save className="w-3.5 h-3.5 text-[#3fb950]" />
                      </button>
                      <button
                        onClick={() => handleClearPolicy(name)}
                        className="p-1.5 hover:bg-[#30363d] rounded"
                        title="Clear policy"
                      >
                        <X className="w-3.5 h-3.5 text-[#8b949e]" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
