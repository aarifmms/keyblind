"use client";

import { useEffect, useState } from "react";
import { KeyblindClient, type KeyblindStatus } from "@/lib/keyblind-client";

export default function Home() {
  const [secretCount, setSecretCount] = useState<number | null>(null);
  const [status, setStatus] = useState<KeyblindStatus | null>(null);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const client = new KeyblindClient();
    client.checkHealth().then(setConnected);
    client.getSecrets().then((s) => setSecretCount(s.length)).catch(() => setSecretCount(0));
    client.getStatus().then(setStatus).catch(() => {});
    client.getAuditLog(5).then(setRecentActivity).catch(() => setRecentActivity([]));
  }, []);

  const tierLabel = status
    ? status.tier === "team"
      ? "Team"
      : status.tier === "pro"
      ? "Pro"
      : "Free"
    : "…";

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Dashboard</h1>
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-4">
          <p className="text-sm text-[#8b949e]">Secrets</p>
          <p className="text-2xl font-bold text-[#58a6ff]">{secretCount ?? "…"}</p>
        </div>
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-4">
          <p className="text-sm text-[#8b949e]">License</p>
          <p className="text-lg font-bold text-[#3fb950]">{tierLabel}</p>
        </div>
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-4">
          <p className="text-sm text-[#8b949e]">Status</p>
          <p className={`text-lg font-bold ${connected ? "text-[#3fb950]" : "text-[#f85149]"}`}>
            {connected ? "Connected" : "Disconnected"}
          </p>
        </div>
      </div>

      <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-4">
        <h2 className="text-sm font-semibold mb-3 text-[#8b949e]">Recent Activity</h2>
        {recentActivity.length === 0 ? (
          <p className="text-sm text-[#8b949e]">No recent activity</p>
        ) : (
          <div className="space-y-2">
            {recentActivity.map((entry: any, i: number) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="text-[#8b949e] text-xs w-16">{entry.timestamp?.slice(0, 16)}</span>
                <span className="bg-[#21262d] px-2 py-0.5 rounded text-xs">{entry.action}</span>
                <span className="text-[#c9d1d9]">{entry.secretName}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
