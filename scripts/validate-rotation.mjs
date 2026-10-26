#!/usr/bin/env node
// Real-account validation harness for the Phase 3 provider-native rotation adapters.
//
// It exercises each adapter's create / verify / revoke / extractExternalId against
// the real cloud CLI — creating a throwaway credential, verifying it works, then
// revoking it — without touching the local vault.
//
// Usage:
//   node scripts/validate-rotation.mjs check                                  # preflight: CLI + auth
//   node scripts/validate-rotation.mjs aws   --iam-user <user>
//   node scripts/validate-rotation.mjs gcp   --service-account <email>
//   node scripts/validate-rotation.mjs azure --app-id <app-id> [--tenant <tenant>]
//
// The harness needs a *scratch* target: a throwaway IAM user, a disposable service
// account, or a test app registration. Never point it at a credential you depend on —
// it will create a new key and then delete it.

import { execFileSync } from "node:child_process";
import { awsIamRotationProvider } from "../dist/rotation/aws.js";
import { gcpServiceAccountRotationProvider } from "../dist/rotation/gcp.js";
import { azureAppCredentialRotationProvider } from "../dist/rotation/azure.js";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

function ok(msg) {
  console.log(`${GREEN}  PASS${RESET} ${msg}`);
}
function fail(msg) {
  console.log(`${RED}  FAIL${RESET} ${msg}`);
}
function note(msg) {
  console.log(`${YELLOW}  NOTE${RESET} ${msg}`);
}

function sh(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] }).trim();
  } catch (e) {
    return null;
  }
}

// --- Preflight: is each CLI installed and authenticated? -------------------------
const CHECKS = {
  aws: {
    present: () => sh("aws", ["--version"]),
    auth: () => sh("aws", ["sts", "get-caller-identity", "--output", "json"]),
    hint: "aws configure          (or aws sso login)",
  },
  gcp: {
    present: () => sh("gcloud", ["--version"]),
    auth: () => {
      const acct = sh("gcloud", ["config", "get-value", "account"]);
      return acct && acct !== "(unset)" ? acct : null;
    },
    hint: "gcloud auth login",
  },
  azure: {
    present: () => sh("az", ["--version"]),
    auth: () => sh("az", ["account", "show", "--output", "json"]),
    hint: "az login",
  },
};

function preflight() {
  console.log("Preflight — CLI presence + auth\n");
  for (const [name, c] of Object.entries(CHECKS)) {
    const present = c.present();
    console.log(`${name}:`);
    if (!present) {
      fail(`CLI not found — install and retry.`);
      continue;
    }
    ok(`CLI present (${present.split("\n")[0]})`);
    const authed = c.auth();
    if (authed) {
      ok("authenticated");
    } else {
      note(`NOT authenticated — run:  ${c.hint}`);
    }
  }
  console.log();
}

// --- Full create → verify → extract → revoke cycle for one provider --------------
async function runCycle(label, provider, ctx) {
  console.log(`${label} — live create/verify/revoke cycle\n`);

  let externalId = "";
  let value = "";

  try {
    const created = await provider.create(ctx);
    value = created.value;
    externalId = created.externalId;
    ok(`create succeeded (externalId=${redact(externalId)})`);
  } catch (e) {
    fail(`create failed: ${e.message}`);
    return false;
  }

  const extracted = provider.extractExternalId(value);
  if (extracted === externalId && extracted !== "") {
    ok(`extractExternalId round-trips (${redact(extracted)})`);
  } else {
    fail(`extractExternalId mismatch: got "${redact(extracted)}", expected "${redact(externalId)}"`);
    await safeRevoke(provider, ctx, externalId);
    return false;
  }

  let verified = false;
  try {
    verified = await provider.verify(ctx, value);
  } catch (e) {
    note(`verify threw (treated as fail): ${e.message}`);
  }
  if (verified) {
    ok("verify true (new credential authenticates)");
  } else {
    fail("verify false — new credential did not authenticate");
    await safeRevoke(provider, ctx, externalId);
    return false;
  }

  try {
    await provider.revoke(ctx, externalId);
    ok("revoke succeeded (credential deleted)");
  } catch (e) {
    fail(`revoke failed: ${e.message}`);
    return false;
  }

  console.log();
  return true;
}

async function safeRevoke(provider, ctx, externalId) {
  if (!externalId) return;
  try {
    await provider.revoke(ctx, externalId);
    note(`cleaned up ${redact(externalId)}`);
  } catch {
    note(`could not clean up ${redact(externalId)} — delete it manually`);
  }
}

function redact(s) {
  if (typeof s !== "string") return s;
  if (s.length <= 8) return s;
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

// --- Arg parsing -----------------------------------------------------------------
const [, , provider, ...rest] = process.argv;

if (!provider || provider === "check" || provider === "preflight") {
  preflight();
  process.exit(0);
}

const ctx = {};
for (let i = 0; i < rest.length; i++) {
  const flag = rest[i];
  if (flag === "--iam-user") ctx.iamUserName = rest[++i];
  else if (flag === "--service-account") ctx.serviceAccountEmail = rest[++i];
  else if (flag === "--app-id") ctx.appId = rest[++i];
  else if (flag === "--tenant") ctx.tenant = rest[++i];
}

const TARGETS = {
  aws: { label: "AWS IAM", provider: awsIamRotationProvider, required: "iamUserName", arg: "--iam-user" },
  gcp: { label: "GCP Service Account", provider: gcpServiceAccountRotationProvider, required: "serviceAccountEmail", arg: "--service-account" },
  azure: { label: "Azure App Credential", provider: azureAppCredentialRotationProvider, required: "appId", arg: "--app-id" },
};

const target = TARGETS[provider];
if (!target) {
  console.error(`Unknown provider "${provider}". Use: aws | gcp | azure | check`);
  process.exit(2);
}
if (!ctx[target.required]) {
  console.error(`${target.label} validation requires ${target.arg} <value>.`);
  process.exit(2);
}

// Confirm the CLI is authenticated before we try to mutate anything.
const authed = CHECKS[provider].auth();
if (!authed) {
  console.error(`${RED}Not authenticated for ${provider}.${RESET} Run:  ${CHECKS[provider].hint}`);
  process.exit(2);
}

const passed = await runCycle(target.label, target.provider, ctx);
process.exit(passed ? 0 : 1);
