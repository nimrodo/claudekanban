import { describe, expect, it } from "vitest";
import {
  HOOK_DEFS,
  type ClaudeSettings,
  type ResolvedHookDef,
  mergeHooks,
  removeHooks,
} from "./install-hooks-lib.js";

function resolvedDefs(commandFor: (scriptFile: string) => string = (f) => `/repo/hooks/${f}`): ResolvedHookDef[] {
  return HOOK_DEFS.map((d) => ({ ...d, command: commandFor(d.scriptFile) }));
}

describe("mergeHooks", () => {
  it("adds all 7 events into empty settings", () => {
    const { settings, added, alreadyPresent } = mergeHooks({}, resolvedDefs());
    expect(added).toHaveLength(7);
    expect(alreadyPresent).toHaveLength(0);
    expect(Object.keys(settings.hooks!)).toHaveLength(7);
    expect(settings.hooks!.SessionStart).toEqual([
      { hooks: [{ type: "command", command: "/repo/hooks/on-session-start.sh" }] },
    ]);
  });

  it("sets matcher only on PostToolUse", () => {
    const { settings } = mergeHooks({}, resolvedDefs());
    expect(settings.hooks!.PostToolUse[0].matcher).toBe("*");
    expect(settings.hooks!.SessionStart[0].matcher).toBeUndefined();
  });

  it("is idempotent on re-merge", () => {
    const first = mergeHooks({}, resolvedDefs());
    const second = mergeHooks(first.settings, resolvedDefs());
    expect(second.added).toHaveLength(0);
    expect(second.alreadyPresent).toHaveLength(7);
    expect(second.settings).toEqual(first.settings);
  });

  it("preserves unrelated existing hook-groups on the same event", () => {
    const existing: ClaudeSettings = {
      hooks: {
        PostToolUse: [
          {
            hooks: [{ type: "command", command: "/Users/nimrodo/.claude/hooks/boost-hook-claude.sh" }],
            matcher: "mcp__.*",
          },
        ],
        Stop: [{ hooks: [{ type: "command", command: "/Users/nimrodo/.claude/hooks/boost-sync.sh" }] }],
      },
    };
    const { settings, added } = mergeHooks(existing, resolvedDefs());
    expect(added).toEqual(expect.arrayContaining(["PostToolUse", "Stop"]));
    expect(settings.hooks!.PostToolUse).toHaveLength(2);
    expect(settings.hooks!.PostToolUse[0]).toEqual(existing.hooks!.PostToolUse[0]);
    expect(settings.hooks!.Stop).toHaveLength(2);
    expect(settings.hooks!.Stop[0]).toEqual(existing.hooks!.Stop[0]);
  });

  it("preserves non-hooks keys in settings untouched", () => {
    const existing: ClaudeSettings = { permissions: { allow: ["Read"] }, effortLevel: "medium" };
    const { settings } = mergeHooks(existing, resolvedDefs());
    expect(settings.permissions).toEqual({ allow: ["Read"] });
    expect(settings.effortLevel).toBe("medium");
  });

  it("resolves paths before comparing, so a symlinked command still counts as present", () => {
    const resolve = (p: string) => (p === "/link/hooks/on-session-start.sh" ? "/real/hooks/on-session-start.sh" : p);
    const existing: ClaudeSettings = {
      hooks: {
        SessionStart: [{ hooks: [{ type: "command", command: "/link/hooks/on-session-start.sh" }] }],
      },
    };
    const defs = resolvedDefs((f) => (f === "on-session-start.sh" ? "/real/hooks/on-session-start.sh" : `/repo/hooks/${f}`));
    const { added, alreadyPresent } = mergeHooks(existing, defs, resolve);
    expect(alreadyPresent).toContain("SessionStart");
    expect(added).not.toContain("SessionStart");
  });
});

describe("removeHooks", () => {
  it("removes only claudekanban's own entries and drops the event key when empty", () => {
    const installed = mergeHooks({}, resolvedDefs()).settings;
    const { settings, removed } = removeHooks(installed, resolvedDefs());
    expect(removed).toHaveLength(7);
    expect(settings.hooks).toEqual({});
  });

  it("leaves unrelated hook-groups on the same event intact", () => {
    const existing: ClaudeSettings = {
      hooks: {
        Stop: [
          { hooks: [{ type: "command", command: "/Users/nimrodo/.claude/hooks/boost-sync.sh" }] },
          { hooks: [{ type: "command", command: "/repo/hooks/on-stop.sh" }] },
        ],
      },
    };
    const { settings, removed } = removeHooks(existing, resolvedDefs());
    expect(removed).toEqual(["Stop"]);
    expect(settings.hooks!.Stop).toEqual([
      { hooks: [{ type: "command", command: "/Users/nimrodo/.claude/hooks/boost-sync.sh" }] },
    ]);
  });

  it("is a no-op when nothing matches", () => {
    const existing: ClaudeSettings = {
      hooks: { Stop: [{ hooks: [{ type: "command", command: "/Users/nimrodo/.claude/hooks/boost-sync.sh" }] }] },
    };
    const { settings, removed } = removeHooks(existing, resolvedDefs());
    expect(removed).toHaveLength(0);
    expect(settings.hooks).toEqual(existing.hooks);
  });

  it("is a no-op when settings has no hooks key at all", () => {
    const { settings, removed } = removeHooks({ permissions: {} }, resolvedDefs());
    expect(removed).toHaveLength(0);
    expect(settings).toEqual({ permissions: {} });
  });

  it("resolves paths before matching, so a symlinked command still gets removed", () => {
    const resolve = (p: string) => (p === "/link/hooks/on-stop.sh" ? "/real/hooks/on-stop.sh" : p);
    const existing: ClaudeSettings = {
      hooks: { Stop: [{ hooks: [{ type: "command", command: "/link/hooks/on-stop.sh" }] }] },
    };
    const defs = resolvedDefs((f) => (f === "on-stop.sh" ? "/real/hooks/on-stop.sh" : `/repo/hooks/${f}`));
    const { settings, removed } = removeHooks(existing, defs, resolve);
    expect(removed).toEqual(["Stop"]);
    expect(settings.hooks!.Stop).toBeUndefined();
  });
});
