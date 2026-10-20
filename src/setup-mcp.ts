import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface SetupResult {
  editor: string;
  action: "configured" | "already_configured" | "skipped" | "failed";
  error?: string;
}

function hasCommand(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function dirExists(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

interface ServerEntry {
  command: string;
  args: string[];
}

// Merge a keyblind MCP server entry into an editor's JSON config file.
// Reads-and-merges (never overwrites); a missing file starts empty and a
// malformed file is left untouched (returned as an error) so user data is
// never clobbered.
export function mergeMcpServer(
  filePath: string,
  configKey: string,
  entry: ServerEntry
): { configured: boolean; already: boolean; error?: string } {
  let config: any = {};
  if (fs.existsSync(filePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        config = parsed;
      }
    } catch {
      return { configured: false, already: false, error: `could not parse ${filePath}` };
    }
  }

  const existing = config[configKey];
  const servers =
    existing && typeof existing === "object" && !Array.isArray(existing) ? existing : {};
  if (servers.keyblind) {
    return { configured: false, already: true };
  }
  servers.keyblind = entry;
  config[configKey] = servers;

  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + "\n");
    fs.renameSync(tmp, filePath);
  } catch (err: any) {
    return { configured: false, already: false, error: err.message };
  }
  return { configured: true, already: false };
}

function setupClaudeCode(): SetupResult {
  if (!hasCommand("claude")) {
    return { editor: "Claude Code", action: "failed", error: "claude CLI not found. Install Claude Code first." };
  }

  // Check if already configured
  try {
    const list = execSync("claude mcp list 2>/dev/null", { encoding: "utf8" });
    if (list.includes("keyblind")) {
      return { editor: "Claude Code", action: "already_configured" };
    }
  } catch {
    // mcp list might fail if no servers configured yet — that's fine
  }

  try {
    execSync("claude mcp add --scope user keyblind -- keyblind start", {
      encoding: "utf8",
      stdio: "pipe",
    });
    return { editor: "Claude Code", action: "configured" };
  } catch (err: any) {
    return { editor: "Claude Code", action: "failed", error: err.stderr || err.message };
  }
}

function setupCline(): SetupResult {
  const dir = path.join(os.homedir(), ".cline");
  if (!dirExists(dir)) {
    return { editor: "Cline", action: "skipped", error: "~/.cline not found" };
  }
  const result = mergeMcpServer(
    path.join(dir, "mcp_settings.json"),
    "mcpServers",
    { command: "keyblind", args: ["start"] }
  );
  if (result.error) return { editor: "Cline", action: "failed", error: result.error };
  if (result.already) return { editor: "Cline", action: "already_configured" };
  return { editor: "Cline", action: "configured" };
}

function setupZed(): SetupResult {
  const dir = path.join(os.homedir(), ".zed");
  if (!dirExists(dir)) {
    return { editor: "Zed", action: "skipped", error: "~/.zed not found" };
  }
  const result = mergeMcpServer(
    path.join(dir, "settings.json"),
    "mcp_servers",
    { command: "keyblind", args: ["start"] }
  );
  if (result.error) return { editor: "Zed", action: "failed", error: result.error };
  if (result.already) return { editor: "Zed", action: "already_configured" };
  return { editor: "Zed", action: "configured" };
}

export function setupAll(): SetupResult[] {
  return [setupClaudeCode(), setupCline(), setupZed()];
}

interface ProjectEditor {
  key: string; // lowercase matcher for --editors, e.g. "cursor"
  editor: string; // display label
  file: string; // path relative to cwd
  configKey: string;
}

const PROJECT_EDITORS: ProjectEditor[] = [
  { key: "cursor", editor: "Cursor", file: ".cursor/mcp.json", configKey: "mcpServers" },
  { key: "windsurf", editor: "Windsurf", file: ".windsurf/mcp.json", configKey: "mcpServers" },
  { key: "copilot", editor: "Copilot", file: ".vscode/mcp.json", configKey: "servers" },
  { key: "cline", editor: "Cline (project)", file: ".cline/mcp.json", configKey: "mcpServers" },
];

// Write project-local MCP configs into cwd. These files contain only the
// keyblind command (no secrets), so they are safe to commit. `editors` is an
// optional list of lowercase editor keys to restrict which files are written.
export function setupLocal(cwd: string, editors?: string[]): SetupResult[] {
  const wanted = editors?.length ? new Set(editors.map((e) => e.toLowerCase().trim())) : null;
  const results: SetupResult[] = [];
  for (const pe of PROJECT_EDITORS) {
    if (wanted && !wanted.has(pe.key)) continue;
    const result = mergeMcpServer(
      path.join(cwd, pe.file),
      pe.configKey,
      { command: "keyblind", args: ["start"] }
    );
    if (result.error) {
      results.push({ editor: pe.editor, action: "failed", error: result.error });
    } else if (result.already) {
      results.push({ editor: pe.editor, action: "already_configured" });
    } else {
      results.push({ editor: pe.editor, action: "configured" });
    }
  }
  return results;
}
