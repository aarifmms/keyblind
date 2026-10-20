import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const state = vi.hoisted(() => ({ tmpDir: "" }));

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return {
    ...actual,
    homedir: () => state.tmpDir,
    default: { ...actual.default, homedir: () => state.tmpDir },
  };
});

vi.mock("node:child_process", () => ({
  execSync: vi.fn(() => {
    throw new Error("command not found");
  }),
}));

import { mergeMcpServer, setupAll } from "../src/setup-mcp.js";

beforeEach(() => {
  state.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "keyblind-mcp-"));
});

afterEach(() => {
  fs.rmSync(state.tmpDir, { recursive: true, force: true });
});

describe("mergeMcpServer", () => {
  it("writes a new config file when none exists", () => {
    const file = path.join(state.tmpDir, "settings.json");
    const result = mergeMcpServer(file, "mcp_servers", { command: "keyblind", args: ["start"] });
    expect(result).toEqual({ configured: true, already: false });
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(parsed).toEqual({ mcp_servers: { keyblind: { command: "keyblind", args: ["start"] } } });
  });

  it("merges into an existing file without clobbering unrelated keys", () => {
    const file = path.join(state.tmpDir, "settings.json");
    fs.writeFileSync(file, JSON.stringify({ theme: "dark", mcp_servers: { other: { command: "x" } } }));
    const result = mergeMcpServer(file, "mcp_servers", { command: "keyblind", args: ["start"] });
    expect(result.configured).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(parsed.theme).toBe("dark");
    expect(parsed.mcp_servers.other).toEqual({ command: "x" });
    expect(parsed.mcp_servers.keyblind).toEqual({ command: "keyblind", args: ["start"] });
  });

  it("is idempotent: reports already when keyblind is present", () => {
    const file = path.join(state.tmpDir, "settings.json");
    fs.writeFileSync(file, JSON.stringify({ mcp_servers: { keyblind: { command: "keyblind", args: ["start"] } } }));
    const result = mergeMcpServer(file, "mcp_servers", { command: "keyblind", args: ["start"] });
    expect(result).toEqual({ configured: false, already: true });
  });

  it("leaves a malformed file untouched and returns an error", () => {
    const file = path.join(state.tmpDir, "settings.json");
    fs.writeFileSync(file, "{ not valid json");
    const result = mergeMcpServer(file, "mcp_servers", { command: "keyblind", args: ["start"] });
    expect(result.configured).toBe(false);
    expect(result.error).toContain("could not parse");
    expect(fs.readFileSync(file, "utf8")).toBe("{ not valid json");
  });
});

describe("setupAll", () => {
  it("skips Cline and Zed when their config dirs are absent", () => {
    const results = setupAll();
    const cline = results.find((r) => r.editor === "Cline")!;
    const zed = results.find((r) => r.editor === "Zed")!;
    expect(cline.action).toBe("skipped");
    expect(zed.action).toBe("skipped");
    expect(results).toHaveLength(3);
  });

  it("configures Cline when ~/.cline exists", () => {
    const clineDir = path.join(state.tmpDir, ".cline");
    fs.mkdirSync(clineDir, { recursive: true });
    const results = setupAll();
    const cline = results.find((r) => r.editor === "Cline")!;
    expect(cline.action).toBe("configured");
    const file = JSON.parse(fs.readFileSync(path.join(clineDir, "mcp_settings.json"), "utf8"));
    expect(file.mcpServers.keyblind).toEqual({ command: "keyblind", args: ["start"] });
  });

  it("configures Zed with the snake_case mcp_servers key", () => {
    const zedDir = path.join(state.tmpDir, ".zed");
    fs.mkdirSync(zedDir, { recursive: true });
    const results = setupAll();
    const zed = results.find((r) => r.editor === "Zed")!;
    expect(zed.action).toBe("configured");
    const file = JSON.parse(fs.readFileSync(path.join(zedDir, "settings.json"), "utf8"));
    expect(file.mcp_servers.keyblind).toEqual({ command: "keyblind", args: ["start"] });
  });
});
