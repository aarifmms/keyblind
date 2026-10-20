import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// CI/CD secret injection: exports the vault as a passphrase-encrypted bundle the
// user commits as a GitHub Actions secret, then decrypts it in CI and writes the
// secrets to $GITHUB_ENV. The bundle is decoupled from the machine-bound vault
// key (which cannot exist on a CI runner), so a passphrase-derived key is used.

const FORMAT = "keyblind-ci-v1";
const KEY_LENGTH = 32;
const PBKDF2_ITERATIONS = 600_000;
const SALT_LENGTH = 32;

export interface CiSecret {
  name: string;
  value: string;
}

function deriveKey(salt: Buffer, passphrase: string): Buffer {
  return crypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, KEY_LENGTH, "sha256");
}

export function createCiBundle(passphrase: string, secrets: CiSecret[]): string {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveKey(salt, passphrase);
  const iv = crypto.randomBytes(12);

  const payload = Buffer.from(JSON.stringify({
    version: 1,
    createdAt: new Date().toISOString(),
    secrets,
  }));

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  const data = Buffer.concat([cipher.update(payload), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return JSON.stringify({
    format: FORMAT,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    data: data.toString("base64"),
  });
}

export function parseCiBundle(bundle: string, passphrase: string): CiSecret[] {
  let parsed: any;
  try {
    parsed = JSON.parse(bundle);
  } catch {
    throw new Error("Invalid CI bundle: not valid JSON");
  }

  if (parsed.format !== FORMAT) {
    throw new Error("Invalid CI bundle: unknown format");
  }

  const salt = Buffer.from(parsed.salt, "base64");
  const iv = Buffer.from(parsed.iv, "base64");
  const authTag = Buffer.from(parsed.authTag, "base64");
  const data = Buffer.from(parsed.data, "base64");

  const key = deriveKey(salt, passphrase);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  decipher.setAuthTag(authTag);

  let payload: Buffer;
  try {
    payload = Buffer.concat([decipher.update(data), decipher.final()]);
  } catch {
    throw new Error("Invalid CI bundle: wrong passphrase or corrupted data");
  }

  let obj: any;
  try {
    obj = JSON.parse(payload.toString());
  } catch {
    throw new Error("Invalid CI bundle: corrupt payload");
  }

  if (obj.version !== 1) {
    throw new Error(`Unsupported CI bundle version: ${obj.version}`);
  }

  return obj.secrets as CiSecret[];
}

// Renders secrets as NAME=value lines in the format GitHub Actions' $GITHUB_ENV
// expects. Multi-line values use the heredoc delimiter syntax.
export function renderEnvFile(secrets: CiSecret[]): string {
  const lines: string[] = [];
  for (const s of secrets) {
    if (!s.name || s.name.includes("=") || s.name.includes("\0") || s.name.includes("\n")) continue;
    if (s.value.includes("\0")) continue;

    if (!s.value.includes("\n")) {
      lines.push(`${s.name}=${s.value}`);
    } else {
      const delim = `KEYBLIND_${crypto.randomBytes(8).toString("hex")}`;
      lines.push(`${s.name}<<${delim}`);
      lines.push(s.value);
      lines.push(delim);
    }
  }
  return lines.length ? lines.join("\n") + "\n" : "";
}

// Writes a GitHub Actions workflow that decrypts the CI bundle and exposes the
// secrets to every subsequent step in the job via $GITHUB_ENV.
export function setupCiInjection(dir: string = process.cwd()): string {
  const workflowsDir = path.join(dir, ".github", "workflows");
  fs.mkdirSync(workflowsDir, { recursive: true });
  const workflowPath = path.join(workflowsDir, "keyblind-ci.yml");
  const yaml = `name: Keyblind CI secrets

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      # Decrypt the bundle and expose vault secrets to every step below.
      - run: npx --yes keyblind ci inject --out "$GITHUB_ENV"
        env:
          KEYBLIND_CI_BUNDLE: \${{ secrets.KEYBLIND_CI_BUNDLE }}
          KEYBLIND_CI_PASSPHRASE: \${{ secrets.KEYBLIND_CI_PASSPHRASE }}
      # Add your build/test steps here. Secrets are available as env vars.
`;
  fs.writeFileSync(workflowPath, yaml, { mode: 0o644 });
  return workflowPath;
}
