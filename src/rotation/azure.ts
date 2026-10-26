import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RotationContext, RotationProvider } from "../rotation.js";

function runAz(args: string[], env?: Record<string, string>): string {
  const result = execFileSync("az", args, {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "ignore"],
    env: { ...process.env, ...env },
  });
  return result.trim();
}

function requireAppId(ctx: RotationContext): string {
  const appId = ctx.appId;
  if (!appId) {
    throw new Error("Azure rotation requires ctx.appId (pass --app-id <app-id>).");
  }
  return appId;
}

// The stored value is "keyId:secret", so the external id (the credential keyId
// needed to revoke a client secret) survives a round-trip through the vault.
function splitValue(value: string): { id: string; secret: string } {
  const idx = value.indexOf(":");
  if (idx === -1) return { id: value, secret: "" };
  return { id: value.slice(0, idx), secret: value.slice(idx + 1) };
}

export const azureAppCredentialRotationProvider: RotationProvider = {
  name: "azure",

  async create(ctx: RotationContext) {
    const appId = requireAppId(ctx);
    // `az ad app credential reset` returns the new password but not its keyId, so
    // tag the new credential with a unique display name and look its keyId up.
    const displayName = `keyblind-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const resetJson = runAz([
      "ad", "app", "credential", "reset", "--id", appId, "--append", "--display-name", displayName,
      "--years", "1", "--output", "json",
    ]);
    const password = (JSON.parse(resetJson) as { password?: string }).password;
    if (!password) {
      throw new Error("Azure credential reset returned no password.");
    }
    const keyId = runAz([
      "ad", "app", "credential", "list", "--id", appId,
      "--query", `[?displayName=='${displayName}'].keyId | [0]`, "--output", "tsv",
    ]);
    if (!keyId) {
      throw new Error("Azure credential reset returned no keyId.");
    }
    return { value: `${keyId}:${password}`, externalId: keyId };
  },

  async verify(ctx: RotationContext, value: string) {
    const appId = requireAppId(ctx);
    const { secret } = splitValue(value);
    if (!secret) return false;
    const dir = mkdtempSync(join(tmpdir(), "keyblind-az-"));
    try {
      const args = ["login", "--service-principal", "-u", appId, "-p", secret];
      if (ctx.tenant) args.push("--tenant", ctx.tenant);
      args.push("--allow-no-subscriptions", "--output", "none");
      runAz(args, { AZURE_CONFIG_DIR: join(dir, "config") });
      return true;
    } catch {
      return false;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },

  async revoke(ctx: RotationContext, externalId: string) {
    const appId = requireAppId(ctx);
    runAz(["ad", "app", "credential", "delete", "--id", appId, "--key-id", externalId]);
  },

  extractExternalId(value: string): string {
    return splitValue(value).id;
  },
};
