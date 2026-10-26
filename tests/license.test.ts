import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Isolate the license file path so a real activated license on this machine
// never affects the test.
const state = vi.hoisted(() => ({ tmpDir: "" }));

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  const homedir = () => {
    if (!state.tmpDir) {
      state.tmpDir = path.join(fs.mkdtempSync(path.join(actual.tmpdir(), "keyblind-lic-")));
    }
    return state.tmpDir;
  };
  return { ...actual, homedir, default: { ...actual.default, homedir } };
});

import { isActivated, isPro, isTeam, isEnterprise, featuresEnabled, tierLabel } from "../src/license.js";

describe("license tiers", () => {
  it("reports free tier when no license is activated", () => {
    expect(isActivated()).toBe(false);
    expect(isPro()).toBe(false);
    expect(isTeam()).toBe(false);
    expect(isEnterprise()).toBe(false);
    expect(featuresEnabled()).toMatchObject({ unlimitedSecrets: false, enterprise: false });
  });

  it("maps every tier to its display label", () => {
    expect(tierLabel("free")).toBe("Free");
    expect(tierLabel("pro")).toBe("Pro");
    expect(tierLabel("team")).toBe("Team");
    expect(tierLabel("enterprise")).toBe("Enterprise");
  });
});
