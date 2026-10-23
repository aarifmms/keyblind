"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Shield, ArrowRight } from "lucide-react";

function LoginForm() {
  const [licenseKey, setLicenseKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<{ id: string; name: string }[]>([]);
  const searchParams = useSearchParams();
  const activated = searchParams.get("activated") === "1";

  useEffect(() => {
    fetch("/api/auth/providers")
      .then((res) => res.json())
      .then((data) => setProviders(Array.isArray(data.providers) ? data.providers : []))
      .catch(() => setProviders([]));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenseKey }),
      });
      const data = await res.json();
      if (res.ok) {
        window.location.href = "/dashboard";
      } else {
        setError(data.error || "Invalid license key");
      }
    } catch {
      setError("Connection failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {activated && (
        <div className="bg-[#3fb950]/10 border border-[#3fb950]/30 rounded-md p-3 mb-4 text-sm text-[#3fb950]">
          Purchase complete! Paste your license key below to sign in.
        </div>
      )}

      <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6">
        <form onSubmit={handleSubmit}>
          <label className="block text-sm text-[#8b949e] mb-1.5">License Key</label>
          <input
            type="text"
            value={licenseKey}
            onChange={(e) => setLicenseKey(e.target.value)}
            placeholder="keyblind.…"
            autoFocus
            autoComplete="off"
            className="w-full bg-[#0d1117] border border-[#21262d] rounded-md px-3 py-2 text-sm text-[#c9d1d9] font-mono focus:outline-none focus:border-[#58a6ff] mb-4"
          />
          {error && <p className="text-xs text-[#f85149] mb-3">{error}</p>}
          <button
            type="submit"
            disabled={loading || !licenseKey}
            className="w-full bg-[#1f6feb] text-white rounded-md py-2 text-sm font-medium hover:bg-[#1a5fd4] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>

      {providers.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-px bg-[#21262d]" />
            <span className="text-xs text-[#8b949e]">or</span>
            <div className="flex-1 h-px bg-[#21262d]" />
          </div>
          <div className="space-y-2">
            {providers.map((p) => (
              <a
                key={p.id}
                href={`/api/auth/sso/start?provider=${encodeURIComponent(p.id)}`}
                className="w-full flex items-center justify-center gap-2 border border-[#30363d] text-[#c9d1d9] rounded-md py-2 text-sm font-medium hover:bg-[#21262d] transition-colors"
              >
                Continue with {p.name}
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 text-center">
        <a
          href="https://keyblind.dev/#pricing"
          className="inline-flex items-center gap-1 text-sm text-[#58a6ff] hover:underline"
        >
          Don&apos;t have a license? Get Keyblind Pro <ArrowRight className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0d1117] p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <a href="https://keyblind.dev" className="inline-block">
            <Shield className="w-10 h-10 text-[#58a6ff] mx-auto mb-3" />
            <h1 className="text-xl font-semibold text-[#f0f6fc]">Keyblind</h1>
          </a>
          <p className="text-sm text-[#8b949e] mt-1">Sign in with your license key</p>
        </div>

        <Suspense
          fallback={
            <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6 text-center">
              <p className="text-sm text-[#8b949e]">Loading...</p>
            </div>
          }
        >
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
