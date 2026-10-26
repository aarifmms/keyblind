import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RotationContext, RotationProvider } from "../rotation.js";

function runGcloud(args: string[], env?: Record<string, string>): string {
  const result = execFileSync("gcloud", args, {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "ignore"],
    env: { ...process.env, ...env },
  });
  return result.trim();
}

function requireEmail(ctx: RotationContext): string {
  const email = ctx.serviceAccountEmail;
  if (!email) {
    throw new Error("GCP rotation requires ctx.serviceAccountEmail (pass --service-account <email>).");
  }
  return email;
}

// The stored value is the full service-account key JSON (usable directly as
// GOOGLE_APPLICATION_CREDENTIALS). The external id is the key's private_key_id.
export const gcpServiceAccountRotationProvider: RotationProvider = {
  name: "gcp",

  async create(ctx: RotationContext) {
    const email = requireEmail(ctx);
    const dir = mkdtempSync(join(tmpdir(), "keyblind-gcp-"));
    const keyFile = join(dir, "key.json");
    try {
      runGcloud(["iam", "service-accounts", "keys", "create", keyFile, "--iam-account", email]);
      const raw = readFileSync(keyFile, "utf8");
      const key = JSON.parse(raw) as { private_key_id?: string };
      if (!key.private_key_id) {
        throw new Error("GCP key file is missing private_key_id.");
      }
      return { value: raw, externalId: key.private_key_id };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },

  async verify(_ctx: RotationContext, value: string) {
    const dir = mkdtempSync(join(tmpdir(), "keyblind-gcp-"));
    const keyFile = join(dir, "key.json");
    try {
      writeFileSync(keyFile, value);
      runGcloud(["auth", "application-default", "print-access-token"], {
        GOOGLE_APPLICATION_CREDENTIALS: keyFile,
        CLOUDSDK_CONFIG: join(dir, "config"),
      });
      return true;
    } catch {
      return false;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },

  async revoke(ctx: RotationContext, externalId: string) {
    const email = requireEmail(ctx);
    runGcloud(["iam", "service-accounts", "keys", "delete", externalId, "--iam-account", email, "--quiet"]);
  },

  extractExternalId(value: string): string {
    try {
      const key = JSON.parse(value) as { private_key_id?: string };
      return key.private_key_id ?? "";
    } catch {
      return "";
    }
  },
};
