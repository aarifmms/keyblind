import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { storeSecret, listSecrets, deleteSecret, resolveSecret, isInitialized, getAuditLog, setClientInfo } from "./vault.js";
import { getBackend } from "./backends.js";
import { sandboxEnvFile, unsandboxEnvFile } from "./sandbox.js";
import { generateTOTPCode, storeTOTP, listTOTP, deleteTOTP, parseOTPAuthURI, getTOTP, type TOTPConfig } from "./totp.js";
import { createShareLink, receiveShare } from "./share.js";
import { getDeadmanStatus, checkin } from "./deadman.js";
import { getLicenseInfo, isPro, featuresEnabled, getSecretLimit } from "./license.js";
import { getSSOToken, isSSOAuthenticated } from "./sso.js";
import { createHttpsServer, certExists, certExpiringSoon, provisionCert, startAutoRenewal, type ACMEOptions } from "./https.js";
import { generateSecret } from "./config.js";
import { teamInit, teamPush, teamPull, teamList, teamResolve, teamDelete } from "./team.js";
import { registerAgent, recordAction, verify, listAgents, listEntries, exportCompliance, authorizeAction, isAgentScopeRequired, filterReadableSecrets } from "./ledger.js";
import { getVersion } from "./version.js";

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

// Returns a deny reason for a signed secret-access request, or null to allow.
// When no agentId is supplied the call is unenforced (backwards compatible with
// direct CLI / human use) unless mandatory enforcement is enabled, in which case
// anonymous access is refused. Supplying agentId opts into signed scope checks.
function checkAgentAccess(
  agentId: string | undefined,
  signature: string | undefined,
  action: "read" | "write",
  target: string,
): string | null {
  if (!agentId) {
    return isAgentScopeRequired() ? "Agent identity required (agent scope enforcement is enabled)" : null;
  }
  return authorizeAction(agentId, action, target, signature ?? "");
}

// The dashboard static export ships next to the compiled server: dist/dashboard/.
const dashboardDir = fileURLToPath(new URL("./dashboard/", import.meta.url));

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json",
  ".webmanifest": "application/manifest+json",
};

function serveDashboard(req: http.IncomingMessage, res: http.ServerResponse): void {
  const rawPath = decodeURIComponent((req.url || "/").split("?")[0]);
  // Next.js client-side navigation fetches the RSC payload (.txt) with this header.
  const isRsc = req.headers["rsc"] === "1";

  let rel = rawPath.replace(/^\/+/, "");
  if (rel === "") rel = isRsc ? "index.txt" : "index.html";

  const root = path.resolve(dashboardDir);
  const resolved = path.resolve(dashboardDir, rel);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  const candidates = [resolved];
  if (!path.extname(resolved)) {
    const idx = isRsc ? "index.txt" : "index.html";
    const alt = isRsc ? "index.html" : "index.txt";
    candidates.push(path.join(resolved, idx), path.join(resolved, alt));
  }

  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) {
        const ext = path.extname(candidate).toLowerCase();
        const type = MIME_TYPES[ext] || "application/octet-stream";
        const body = fs.readFileSync(candidate);
        res.writeHead(200, {
          "Content-Type": type,
          "Cache-Control": ext === ".html" || ext === ".txt" ? "no-cache" : "public, max-age=31536000, immutable",
        });
        res.end(req.method === "HEAD" ? undefined : body);
        return;
      }
    } catch {
      // fall through to next candidate / fallback
    }
  }

  // SPA fallback: unknown extensionless routes map to index.html for client-side routing.
  if (!path.extname(resolved)) {
    try {
      const indexFile = path.join(root, "index.html");
      if (fs.statSync(indexFile).isFile()) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
        res.end(req.method === "HEAD" ? undefined : fs.readFileSync(indexFile));
        return;
      }
    } catch {
      // no index.html — fall through to 404
    }
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
}

export function createServer(): McpServer {
  setClientInfo("mcp");

  const server = new McpServer({
    name: "keyblind",
    version: getVersion(),
  });

  server.tool(
    "resolve_secret",
    "Resolve a secret by name using the configured backend (local vault, 1Password, Bitwarden, or env vars). Returns the decrypted value at runtime. The secret value is never visible in the LLM conversation transcript — it is resolved just-in-time for the current operation.",
    {
      name: z.string().describe("The name of the secret to resolve (e.g., OPENAI_API_KEY, DATABASE_URL)"),
      agentId: z.string().optional().describe("Agent ID for signed, scope-enforced access (optional)"),
      signature: z.string().optional().describe("Ed25519 signature over 'read:<name>' in base64 (optional)"),
    },
    async ({ name, agentId, signature }) => {
      if (!isInitialized()) {
        return {
          content: [{ type: "text", text: '{"error":"Keyblind vault not initialized. Run: keyblind init"}' }],
          isError: true,
        };
      }

      const deny = checkAgentAccess(agentId, signature, "read", name);
      if (deny) {
        return { content: [{ type: "text", text: JSON.stringify({ error: `Access denied: ${deny}` }) }], isError: true };
      }

      const backend = getBackend();
      const value = backend.resolve(name);
      if (value === null) {
        const allNames = backend.list();
        return {
          content: [{ type: "text", text: JSON.stringify({ error: `Secret "${name}" not found. Available: ${allNames.join(", ") || "(none)"}` }) }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify({ name, value }) }],
      };
    },
  );

  server.tool(
    "store_secret",
    "Store a secret in the encrypted vault. The value is encrypted with AES-256-GCM before storage. The secret value is never visible in the LLM conversation transcript after this call.",
    {
      name: z.string().describe("A unique name for the secret (e.g., OPENAI_API_KEY, DATABASE_URL)"),
      value: z.string().describe("The secret value to encrypt and store"),
      agentId: z.string().optional().describe("Agent ID for signed, scope-enforced access (optional)"),
      signature: z.string().optional().describe("Ed25519 signature over 'write:<name>' in base64 (optional)"),
    },
    async ({ name, value, agentId, signature }) => {
      if (!isInitialized()) {
        return {
          content: [{ type: "text", text: '{"error":"Keyblind vault not initialized. Run: keyblind init"}' }],
          isError: true,
        };
      }

      const deny = checkAgentAccess(agentId, signature, "write", name);
      if (deny) {
        return { content: [{ type: "text", text: JSON.stringify({ error: `Access denied: ${deny}` }) }], isError: true };
      }

      storeSecret(name, value);
      return {
        content: [{ type: "text", text: JSON.stringify({ stored: name, status: "encrypted_and_saved" }) }],
      };
    },
  );

  server.tool(
    "list_secrets",
    "List all stored secret names (names only — values are never revealed in this listing).",
    {
      agentId: z.string().optional().describe("Agent ID for signed, scope-enforced access (optional)"),
      signature: z.string().optional().describe("Ed25519 signature over 'read:*' in base64 (optional)"),
    },
    async ({ agentId, signature }) => {
      if (!isInitialized()) {
        return {
          content: [{ type: "text", text: JSON.stringify({ secrets: [] }) }],
        };
      }

      const deny = checkAgentAccess(agentId, signature, "read", "*");
      if (deny) {
        return { content: [{ type: "text", text: JSON.stringify({ error: `Access denied: ${deny}` }) }], isError: true };
      }

      const names = listSecrets().filter((n) => !n.startsWith("_keyblind") && !n.startsWith("_totp") && !n.startsWith("__keyblind"));
      const visible = agentId ? filterReadableSecrets(agentId, names) : names;
      return {
        content: [{ type: "text", text: JSON.stringify({ secrets: visible }) }],
      };
    },
  );

  server.tool(
    "sandbox_env",
    "Replace real values in your .env file with deterministic fake values. Real values are encrypted and backed up to the vault. AI agents reading .env files will only see fakes. Use unsandbox_env to restore real values.",
    {
      filePath: z.string().optional().describe("Path to the .env file. Defaults to .env in current directory."),
    },
    async ({ filePath }) => {
      if (!isInitialized()) {
        return {
          content: [{ type: "text", text: '{"error":"Keyblind vault not initialized. Run: keyblind init"}' }],
          isError: true,
        };
      }

      try {
        const result = sandboxEnvFile(filePath);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              sandboxed: result.sandboxed,
              message: `${result.sandboxed.length} value(s) replaced with deterministic fakes. Real values backed up to vault.`,
            }),
          }],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: err.message }) }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "unsandbox_env",
    "Restore real .env values from the vault. Reverses the sandbox operation.",
    {
      filePath: z.string().optional().describe("Path to the .env file. Defaults to .env in current directory."),
    },
    async ({ filePath }) => {
      if (!isInitialized()) {
        return {
          content: [{ type: "text", text: '{"error":"Keyblind vault not initialized. Run: keyblind init"}' }],
          isError: true,
        };
      }

      try {
        const restored = unsandboxEnvFile(filePath);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              restored,
              message: `${restored.length} value(s) restored from vault.`,
            }),
          }],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: err.message }) }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "delete_secret",
    "Delete a secret from the vault.",
    {
      name: z.string().describe("The name of the secret to delete"),
      agentId: z.string().optional().describe("Agent ID for signed, scope-enforced access (optional)"),
      signature: z.string().optional().describe("Ed25519 signature over 'write:<name>' in base64 (optional)"),
    },
    async ({ name, agentId, signature }) => {
      if (!isInitialized()) {
        return {
          content: [{ type: "text", text: '{"error":"Keyblind vault not initialized. Run: keyblind init"}' }],
          isError: true,
        };
      }

      const deny = checkAgentAccess(agentId, signature, "write", name);
      if (deny) {
        return { content: [{ type: "text", text: JSON.stringify({ error: `Access denied: ${deny}` }) }], isError: true };
      }

      const deleted = deleteSecret(name);
      return {
        content: [{ type: "text", text: JSON.stringify({ deleted, name }) }],
      };
    },
  );

  server.tool(
    "audit_log",
    "View the audit log of secret resolutions, stores, and deletes. Shows who accessed which secret and when.",
    {
      limit: z.number().optional().describe("Maximum number of entries to return (default: 50)"),
    },
    async ({ limit }) => {
      if (!isInitialized()) {
        return {
          content: [{ type: "text", text: JSON.stringify({ entries: [] }) }],
        };
      }

      const entries = getAuditLog(limit ?? 50);
      return {
        content: [{ type: "text", text: JSON.stringify({ entries }) }],
      };
    },
  );

  // TOTP tools
  server.tool(
    "totp_code",
    "Generate a TOTP 2FA code for a stored secret. Returns the current 6 or 8 digit code and seconds remaining until rotation.",
    { name: z.string().describe("Name of the stored TOTP configuration") },
    async ({ name }) => {
      if (!isInitialized()) {
        return { content: [{ type: "text", text: JSON.stringify({ error: "Vault not initialized" }) }], isError: true };
      }
      const result = generateTOTPCode(name);
      if (!result) {
        return { content: [{ type: "text", text: JSON.stringify({ error: `TOTP "${name}" not found` }) }], isError: true };
      }
      return { content: [{ type: "text", text: JSON.stringify({ name, code: result.code, remainingSeconds: result.remaining }) }] };
    },
  );

  server.tool(
    "totp_store",
    "Store a TOTP configuration from an otpauth:// URI (from QR code scan or manual entry).",
    {
      name: z.string().describe("A name to identify this TOTP config"),
      uri: z.string().describe("otpauth:// URI for the TOTP secret"),
    },
    async ({ name, uri }) => {
      if (!isInitialized()) {
        return { content: [{ type: "text", text: JSON.stringify({ error: "Vault not initialized" }) }], isError: true };
      }
      try {
        storeTOTP(name, uri);
        const config = parseOTPAuthURI(uri);
        return { content: [{ type: "text", text: JSON.stringify({ stored: name, issuer: config.issuer, account: config.account }) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: err.message }) }], isError: true };
      }
    },
  );

  server.tool(
    "totp_list",
    "List all stored TOTP configurations.",
    {},
    async () => {
      if (!isInitialized()) {
        return { content: [{ type: "text", text: JSON.stringify({ totps: [] }) }] };
      }
      return { content: [{ type: "text", text: JSON.stringify({ totps: listTOTP() }) }] };
    },
  );

  server.tool(
    "totp_delete",
    "Delete a stored TOTP configuration.",
    { name: z.string().describe("Name of the TOTP config to delete") },
    async ({ name }) => {
      if (!isInitialized()) {
        return { content: [{ type: "text", text: JSON.stringify({ error: "Vault not initialized" }) }], isError: true };
      }
      const deleted = deleteTOTP(name);
      return { content: [{ type: "text", text: JSON.stringify({ deleted, name }) }] };
    },
  );

  // Secret sharing tools
  server.tool(
    "create_share_link",
    "Create an encrypted, expiring share link for a secret. The secret is encrypted into the URL fragment and never sent to any server.",
    {
      name: z.string().describe("Name of the secret to share"),
      ttl: z.string().optional().describe("Time to live, e.g. 24h, 7d, 30m (default: 24h)"),
      maxViews: z.number().optional().describe("Maximum number of times the link can be used (informational only)"),
    },
    async ({ name, ttl, maxViews }) => {
      if (!isInitialized()) {
        return { content: [{ type: "text", text: JSON.stringify({ error: "Vault not initialized" }) }], isError: true };
      }
      try {
        const { url, fragment } = createShareLink(name, { ttl, maxViews });
        return { content: [{ type: "text", text: JSON.stringify({ url, fragment: fragment.slice(0, 16) + "..." }) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: err.message }) }], isError: true };
      }
    },
  );

  server.tool(
    "receive_share",
    "Receive and decrypt a shared secret from a share URL fragment.",
    {
      fragment: z.string().describe("The share URL fragment (everything after # in the share link)"),
      targetName: z.string().optional().describe("Optional: store under a different name"),
    },
    async ({ fragment, targetName }) => {
      if (!isInitialized()) {
        return { content: [{ type: "text", text: JSON.stringify({ error: "Vault not initialized" }) }], isError: true };
      }
      try {
        const { name } = receiveShare(fragment, targetName);
        return { content: [{ type: "text", text: JSON.stringify({ received: name, stored: true }) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: err.message }) }], isError: true };
      }
    },
  );

  // Dead man's switch tools
  server.tool(
    "deadman_status",
    "Check dead man's switch status — days until vault access is released to designated contacts.",
    {},
    async () => {
      if (!isInitialized()) {
        return { content: [{ type: "text", text: JSON.stringify({ error: "Vault not initialized" }) }], isError: true };
      }
      const status = getDeadmanStatus();
      return { content: [{ type: "text", text: JSON.stringify(status) }] };
    },
  );

  server.tool(
    "deadman_checkin",
    "Check in to reset the dead man's switch timer.",
    {},
    async () => {
      if (!isInitialized()) {
        return { content: [{ type: "text", text: JSON.stringify({ error: "Vault not initialized" }) }], isError: true };
      }
      checkin();
      const status = getDeadmanStatus();
      return { content: [{ type: "text", text: JSON.stringify({ checkedIn: true, daysRemaining: status.daysRemaining }) }] };
    },
  );

  // Team vault tools
  server.tool(
    "team_init",
    "Create a new shared team vault (encrypted SQLite). Requires a passphrase.",
    {
      passphrase: z.string().describe("Passphrase to encrypt the team vault"),
      path: z.string().optional().describe("Optional path for the team vault file"),
    },
    async ({ passphrase, path }) => {
      try {
        const vaultPath = teamInit(passphrase, path);
        return { content: [{ type: "text", text: JSON.stringify({ success: true, path: vaultPath }) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: err.message }) }], isError: true };
      }
    },
  );

  server.tool(
    "team_push",
    "Push a local secret to the shared team vault.",
    {
      name: z.string().describe("Name of the secret to push"),
      passphrase: z.string().describe("Team vault passphrase"),
      value: z.string().optional().describe("Optional: value to push (if omitted, resolves from local vault)"),
    },
    async ({ name, passphrase, value }) => {
      try {
        const resolved = resolveSecret(name);
        if (!resolved && !value) {
          return { content: [{ type: "text", text: JSON.stringify({ error: `Secret "${name}" not found in local vault. Provide a value.` }) }], isError: true };
        }
        const secretValue = value || resolved!;
        teamPush(name, secretValue, passphrase);
        return { content: [{ type: "text", text: JSON.stringify({ success: true, name }) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: err.message }) }], isError: true };
      }
    },
  );

  server.tool(
    "team_pull",
    "Import all secrets from the team vault into your local vault.",
    {
      passphrase: z.string().describe("Team vault passphrase"),
    },
    async ({ passphrase }) => {
      try {
        const names = teamPull(passphrase);
        return { content: [{ type: "text", text: JSON.stringify({ success: true, imported: names.length, names }) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: err.message }) }], isError: true };
      }
    },
  );

  server.tool(
    "team_list",
    "List all secret names in the team vault.",
    {
      passphrase: z.string().describe("Team vault passphrase"),
    },
    async ({ passphrase }) => {
      try {
        const names = teamList(passphrase);
        return { content: [{ type: "text", text: JSON.stringify({ names }) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: err.message }) }], isError: true };
      }
    },
  );

  server.tool(
    "team_resolve",
    "Resolve (decrypt) a single secret from the team vault.",
    {
      name: z.string().describe("Name of the secret to resolve"),
      passphrase: z.string().describe("Team vault passphrase"),
    },
    async ({ name, passphrase }) => {
      try {
        const value = teamResolve(name, passphrase);
        if (value === null) {
          return { content: [{ type: "text", text: JSON.stringify({ error: `Secret "${name}" not found in team vault` }) }], isError: true };
        }
        return { content: [{ type: "text", text: JSON.stringify({ name, value }) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: err.message }) }], isError: true };
      }
    },
  );

  server.tool(
    "team_delete",
    "Delete a secret from the team vault.",
    {
      name: z.string().describe("Name of the secret to delete"),
      passphrase: z.string().describe("Team vault passphrase"),
    },
    async ({ name, passphrase }) => {
      try {
        const deleted = teamDelete(name, passphrase);
        return { content: [{ type: "text", text: JSON.stringify({ success: deleted, name }) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: err.message }) }], isError: true };
      }
    },
  );

  // SSO tools
  server.tool(
    "sso_status",
    "Check SSO/OIDC authentication status for team vault access.",
    {},
    async () => {
      const token = getSSOToken();
      if (token && token.expiresAt * 1000 > Date.now()) {
        return { content: [{ type: "text", text: JSON.stringify({ authenticated: true, email: token.claims.email, expiresAt: token.expiresAt }) }] };
      }
      return { content: [{ type: "text", text: JSON.stringify({ authenticated: false }) }] };
    },
  );

  // Agent Accountability ledger tools
  server.tool(
    "register_agent",
    "Register an AI agent in the Know Your Agent registry, bound to a human sponsor. Returns the agent identity and its Ed25519 private key, which the agent holds to sign its own actions.",
    {
      name: z.string().describe("Human-readable agent name (e.g., billing-agent)"),
      sponsor: z.string().describe("Human accountable for this agent (email or name)"),
      scope: z.string().optional().describe("What the agent is authorized to do (e.g., read:invoices)"),
    },
    async ({ name, sponsor, scope }) => {
      try {
        const { identity, privateKey } = registerAgent(name, sponsor, scope ?? "");
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ identity, privateKey, note: "Store this private key securely — it signs actions as this agent." }),
          }],
        };
      } catch (err: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: err.message }) }], isError: true };
      }
    },
  );

  server.tool(
    "record_action",
    "Append a signed action to the tamper-proof agent ledger. Each entry is hash-chained and Ed25519-signed, so any later edit or reorder is detectable.",
    {
      agentId: z.string().describe("The agent ID returned by register_agent"),
      privateKey: z.string().describe("The agent's Ed25519 private key (base64)"),
      action: z.string().describe("The action taken (e.g., resolve_secret, store_secret)"),
      target: z.string().optional().describe("The target of the action (e.g., a secret name)"),
      metadata: z.string().optional().describe("JSON string with extra context"),
    },
    async ({ agentId, privateKey, action, target, metadata }) => {
      try {
        const entry = recordAction(agentId, privateKey, action, target ?? "", metadata ?? "{}");
        return { content: [{ type: "text", text: JSON.stringify(entry) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: err.message }) }], isError: true };
      }
    },
  );

  server.tool(
    "verify_ledger",
    "Verify the integrity of the agent action ledger by re-walking the hash chain and signatures. Returns the first sequence that fails if the ledger was tampered with.",
    {},
    async () => {
      const result = verify();
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );

  server.tool(
    "list_agents",
    "List all agents in the Know Your Agent registry.",
    {},
    async () => {
      return { content: [{ type: "text", text: JSON.stringify({ agents: listAgents() }) }] };
    },
  );

  server.tool(
    "export_compliance",
    "Export the agent action ledger as a compliance report (JSON or CSV) with human-sponsor attribution.",
    {
      format: z.enum(["json", "csv"]).optional().describe("Output format (default: json)"),
    },
    async ({ format }) => {
      const report = exportCompliance(format ?? "json");
      return { content: [{ type: "text", text: report }] };
    },
  );

  return server;
}

export async function startServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export async function startHttpServer(port: number = 4318, httpsConfig?: ACMEOptions, host: string = "127.0.0.1"): Promise<void> {
  const mcpServer = createServer();

  // Single transport instance handles all requests with session management
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await mcpServer.connect(transport);

  const appHandler = async (req: http.IncomingMessage, res: http.ServerResponse) => {
    // CORS for browser-based clients
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Mcp-Session-Id, Accept");
    // Allow the public dashboard (app.keyblind.dev) to reach this local server
    // from a secure context (Chrome Private Network Access / local network checks).
    res.setHeader("Access-Control-Allow-Private-Network", "true");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Health check
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", server: "keyblind", version: getVersion(), secretCount: isInitialized() ? listSecrets().filter((n: string) => !n.startsWith("_keyblind") && !n.startsWith("_totp")).length : 0 }));
      return;
    }

    // Status (dashboard license/tier surface — no auth needed on localhost)
    if (req.url === "/api/status" && req.method === "GET") {
      const info = getLicenseInfo();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        initialized: isInitialized(),
        tier: info ? info.tier : "free",
        email: info ? info.email : null,
        exp: info ? info.exp : null,
        iat: info ? info.iat : null,
        id: info ? info.id : null,
        pro: isPro(),
        features: featuresEnabled(),
        secretLimit: getSecretLimit(),
        version: getVersion(),
      }));
      return;
    }

    // ── REST API (for browser dashboard) ──
    if (req.url === "/api/secrets" && req.method === "GET") {
      if (!isInitialized()) { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Not initialized" })); return; }
      const names = listSecrets().filter((n: string) => !n.startsWith("_keyblind") && !n.startsWith("_totp") && !n.startsWith("__keyblind"));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ secrets: names }));
      return;
    }

    if (req.url === "/api/secrets" && req.method === "POST") {
      if (!isInitialized()) { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Not initialized" })); return; }
      const body = await readBody(req);
      try {
        const { name, value } = JSON.parse(body);
        if (!name || value === undefined) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "name and value required" })); return; }
        storeSecret(name, value);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ stored: name }));
      } catch { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Invalid JSON" })); }
      return;
    }

    if (req.url?.startsWith("/api/secrets/") && req.method === "GET") {
      if (!isInitialized()) { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Not initialized" })); return; }
      const name = decodeURIComponent(req.url.slice("/api/secrets/".length));
      const backend = getBackend();
      const value = backend.resolve(name);
      if (value === null) { res.writeHead(404, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Not found" })); return; }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ name, value }));
      return;
    }

    if (req.url?.startsWith("/api/secrets/") && req.method === "DELETE") {
      if (!isInitialized()) { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Not initialized" })); return; }
      const name = decodeURIComponent(req.url.slice("/api/secrets/".length));
      deleteSecret(name);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ deleted: name }));
      return;
    }

    if (req.url?.startsWith("/api/audit") && req.method === "GET") {
      if (!isInitialized()) { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Not initialized" })); return; }
      const url = new URL(req.url, `http://localhost:${port}`);
      const limit = parseInt(url.searchParams.get("limit") || "50", 10);
      const entries = getAuditLog(limit);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ entries }));
      return;
    }

    // ── Agent ledger REST API ──
    if (req.url === "/api/agents" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ agents: listAgents() }));
      return;
    }

    if (req.url === "/api/agents" && req.method === "POST") {
      const body = await readBody(req);
      try {
        const { name, sponsor, scope } = JSON.parse(body);
        if (!name || !sponsor) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "name and sponsor required" })); return; }
        const { identity, privateKey } = registerAgent(name, sponsor, scope || "");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ identity, privateKey }));
      } catch (err: any) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: err.message || "Invalid request" })); }
      return;
    }

    if (req.url === "/api/agents/ledger" && req.method === "GET") {
      const verification = verify();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ verification, entries: listEntries() }));
      return;
    }

    if (req.url?.startsWith("/api/agents/export") && req.method === "GET") {
      const url = new URL(req.url, `http://localhost:${port}`);
      const format = url.searchParams.get("format") === "csv" ? "csv" : "json";
      const report = exportCompliance(format);
      res.writeHead(200, {
        "Content-Type": format === "csv" ? "text/csv" : "application/json",
        "Content-Disposition": `attachment; filename="agent-ledger.${format}"`,
      });
      res.end(report);
      return;
    }

    // ── TOTP REST API ──
    if (req.url === "/api/totp" && req.method === "GET") {
      if (!isInitialized()) { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Not initialized" })); return; }
      const totps = listTOTP().map((name: string) => {
        const config = getTOTP(name);
        return config ? { name: config.name, issuer: config.issuer, account: config.account } : { name };
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ configs: totps }));
      return;
    }

    if (req.url === "/api/totp" && req.method === "POST") {
      if (!isInitialized()) { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Not initialized" })); return; }
      const body = await readBody(req);
      try {
        const { name, uri } = JSON.parse(body);
        if (!name || !uri) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "name and uri required" })); return; }
        storeTOTP(name, uri);
        const config = parseOTPAuthURI(uri);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ stored: name, issuer: config.issuer, account: config.account }));
      } catch (err: any) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: err.message || "Invalid request" })); }
      return;
    }

    if (req.url?.startsWith("/api/totp/") && req.url.endsWith("/code") && req.method === "GET") {
      if (!isInitialized()) { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Not initialized" })); return; }
      const name = decodeURIComponent(req.url.slice("/api/totp/".length, -"/code".length));
      const result = generateTOTPCode(name);
      if (!result) { res.writeHead(404, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Not found" })); return; }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ name, code: result.code, remainingSeconds: result.remaining }));
      return;
    }

    if (req.url?.startsWith("/api/totp/") && req.method === "DELETE") {
      if (!isInitialized()) { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Not initialized" })); return; }
      const name = decodeURIComponent(req.url.slice("/api/totp/".length));
      deleteTOTP(name);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ deleted: name }));
      return;
    }

    // ── Share REST API ──
    if (req.url === "/api/share" && req.method === "POST") {
      if (!isInitialized()) { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Not initialized" })); return; }
      const body = await readBody(req);
      try {
        const { name, ttl, maxViews } = JSON.parse(body);
        if (!name) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "name required" })); return; }
        const { url } = createShareLink(name, { ttl, maxViews });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ url }));
      } catch (err: any) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: err.message || "Invalid request" })); }
      return;
    }

    if (req.url === "/api/share/receive" && req.method === "POST") {
      if (!isInitialized()) { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Not initialized" })); return; }
      const body = await readBody(req);
      try {
        const { fragment, targetName } = JSON.parse(body);
        if (!fragment) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "fragment required" })); return; }
        const { name } = receiveShare(fragment, targetName);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ received: name, stored: true }));
      } catch (err: any) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: err.message || "Invalid request" })); }
      return;
    }

    // ── Deadman REST API ──
    if (req.url === "/api/deadman" && req.method === "GET") {
      if (!isInitialized()) { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Not initialized" })); return; }
      const status = getDeadmanStatus();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(status));
      return;
    }

    if (req.url === "/api/deadman/checkin" && req.method === "POST") {
      if (!isInitialized()) { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Not initialized" })); return; }
      checkin();
      const status = getDeadmanStatus();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ checkedIn: true, ...status }));
      return;
    }

    // ── Team REST API ──
    if (req.url === "/api/team/init" && req.method === "POST") {
      const body = await readBody(req);
      try {
        const { passphrase, path } = JSON.parse(body);
        if (!passphrase) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "passphrase required" })); return; }
        const vaultPath = teamInit(passphrase, path);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, path: vaultPath }));
      } catch (err: any) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: err.message })); }
      return;
    }

    if (req.url === "/api/team/list" && req.method === "POST") {
      const body = await readBody(req);
      try {
        const { passphrase } = JSON.parse(body);
        if (!passphrase) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "passphrase required" })); return; }
        const names = teamList(passphrase);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ names }));
      } catch (err: any) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: err.message })); }
      return;
    }

    if (req.url === "/api/team/push" && req.method === "POST") {
      const body = await readBody(req);
      try {
        const { name, value, passphrase } = JSON.parse(body);
        if (!name || !passphrase) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "name and passphrase required" })); return; }
        const resolved = resolveSecret(name);
        if (!resolved && !value) { res.writeHead(404, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: `Secret "${name}" not found in local vault` })); return; }
        const secretValue = value || resolved!;
        teamPush(name, secretValue, passphrase);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, name }));
      } catch (err: any) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: err.message })); }
      return;
    }

    if (req.url === "/api/team/pull" && req.method === "POST") {
      const body = await readBody(req);
      try {
        const { passphrase } = JSON.parse(body);
        if (!passphrase) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "passphrase required" })); return; }
        const names = teamPull(passphrase);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, imported: names.length, names }));
      } catch (err: any) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: err.message })); }
      return;
    }

    if (req.url?.startsWith("/api/team/") && req.method === "DELETE") {
      const body = await readBody(req);
      try {
        const name = decodeURIComponent(req.url.slice("/api/team/".length));
        const { passphrase } = JSON.parse(body);
        if (!passphrase) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "passphrase required" })); return; }
        const deleted = teamDelete(name, passphrase);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: deleted, name }));
      } catch (err: any) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: err.message })); }
      return;
    }

    // ── Misc REST API ──
    if (req.url === "/api/generate" && req.method === "POST") {
      if (!isInitialized()) { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Not initialized" })); return; }
      const body = await readBody(req);
      try {
        const { name, length, noSymbols } = JSON.parse(body);
        if (!name) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "name required" })); return; }
        const value = generateSecret(length || 32, !noSymbols);
        storeSecret(name, value);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ stored: name, generated: true }));
      } catch (err: any) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: err.message || "Invalid request" })); }
      return;
    }

    // MCP endpoint
    if (req.url === "/mcp" || req.url?.startsWith("/mcp")) {
      await transport.handleRequest(req, res);
      return;
    }

    // Static dashboard (same-origin with the REST API, so no CORS/LNA needed)
    if (req.method === "GET" || req.method === "HEAD") {
      serveDashboard(req, res);
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  };

  if (httpsConfig) {
    // HTTPS mode with Let's Encrypt
    if (!certExists(httpsConfig.domain) || certExpiringSoon(httpsConfig.domain)) {
      console.log(`[keyblind] Provisioning Let's Encrypt certificate for ${httpsConfig.domain}...`);
      await provisionCert(httpsConfig);
    }
    startAutoRenewal(httpsConfig.domain, httpsConfig.email);

    const { httpsServer, httpServer } = createHttpsServer(appHandler, httpsConfig);

    return new Promise((resolve) => {
      httpServer.listen(httpsConfig.httpPort || 80, () => {
        console.log(`HTTP redirect listening on port ${httpsConfig.httpPort || 80}`);
      });
      httpsServer.listen(httpsConfig.port || 443, () => {
        console.log(`Keyblind MCP HTTPS server listening on https://${httpsConfig.domain}:${httpsConfig.port || 443}`);
        console.log(`  MCP endpoint: https://${httpsConfig.domain}/mcp`);
        console.log(`  Health:       https://${httpsConfig.domain}/health`);
        resolve();
      });
    });
  }

  const httpServer = http.createServer(appHandler);

  return new Promise((resolve) => {
    httpServer.listen(port, host, () => {
      console.log(`Keyblind MCP HTTP server listening on http://localhost:${port}`);
      console.log(`  Dashboard:    http://localhost:${port}/`);
      console.log(`  MCP endpoint: http://localhost:${port}/mcp`);
      console.log(`  Health:       http://localhost:${port}/health`);
      resolve();
    });
  });
}
