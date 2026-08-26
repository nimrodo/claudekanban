import { describe, expect, it } from "vitest";
import { resolveSettingsPath, resolveHookDefs } from "./installHooks.js";

describe("resolveSettingsPath", () => {
  it("joins the workspace folder path with .claude/settings.json", () => {
    expect(resolveSettingsPath("/Users/me/myproject")).toBe("/Users/me/myproject/.claude/settings.json");
  });
});

describe("resolveHookDefs", () => {
  it("chmods each hook script and resolves its command to the realpath'd script path", () => {
    const chmodCalls: Array<{ path: string; mode: number }> = [];
    const chmod = (path: string, mode: number) => chmodCalls.push({ path, mode });
    const realpath = (path: string) => `/resolved${path}`;

    const defs = resolveHookDefs("/hooks", chmod, realpath);

    expect(defs.length).toBeGreaterThan(0);
    for (const def of defs) {
      expect(def.command).toMatch(/^\/resolved\/hooks\//);
    }
    expect(chmodCalls.length).toBe(defs.length);
    expect(chmodCalls[0].mode).toBe(0o755);
  });

  it("falls back to the raw script path if chmod throws", () => {
    const chmod = () => {
      throw new Error("EACCES");
    };
    const realpath = (path: string) => `/resolved${path}`;

    const defs = resolveHookDefs("/hooks", chmod, realpath);

    expect(defs.length).toBeGreaterThan(0);
  });
});
