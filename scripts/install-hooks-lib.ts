export interface HookCommandEntry {
  type: "command";
  command: string;
}

export interface HookGroup {
  matcher?: string;
  hooks: HookCommandEntry[];
}

export type HooksConfig = Record<string, HookGroup[]>;

export interface ClaudeSettings {
  hooks?: HooksConfig;
  [key: string]: unknown;
}

export interface HookDef {
  event: string;
  scriptFile: string;
  matcher?: string;
}

export interface ResolvedHookDef extends HookDef {
  command: string;
}

/** The claudekanban hook events, in the order they should be written. */
export const HOOK_DEFS: HookDef[] = [
  { event: "SessionStart", scriptFile: "on-session-start.sh" },
  { event: "PostToolUse", scriptFile: "on-tool-use.sh", matcher: "*" },
  { event: "Stop", scriptFile: "on-stop.sh" },
  { event: "SubagentStart", scriptFile: "on-subagent-start.sh" },
  { event: "SubagentStop", scriptFile: "on-subagent-stop.sh" },
  { event: "Notification", scriptFile: "on-notification.sh" },
  { event: "PermissionRequest", scriptFile: "on-permission-request.sh" },
];

/** Resolves a command path to a canonical form for comparison. */
export type PathResolver = (p: string) => string;

export const identityResolver: PathResolver = (p) => p;

function resolveOrRaw(resolve: PathResolver, command: string): string {
  try {
    return resolve(command);
  } catch {
    // Target no longer exists on disk (e.g. repo moved) — fall back to a raw
    // comparison rather than throwing, so a stale entry just won't match.
    return command;
  }
}

function groupHasCommand(group: HookGroup, command: string, resolve: PathResolver): boolean {
  const target = resolveOrRaw(resolve, command);
  return group.hooks.some((h) => resolveOrRaw(resolve, h.command) === target);
}

export interface MergeResult {
  settings: ClaudeSettings;
  added: string[];
  alreadyPresent: string[];
}

/**
 * Merges the given hook definitions into `settings.hooks`, event by event.
 * Never touches an event's existing hook-groups beyond appending — any
 * hook-group already present (this repo's or unrelated tooling's) survives
 * untouched. Skips an event entirely if a matching command is already
 * registered for it (idempotent re-run).
 */
export function mergeHooks(
  settings: ClaudeSettings,
  defs: ResolvedHookDef[],
  resolve: PathResolver = identityResolver,
): MergeResult {
  const hooks: HooksConfig = { ...(settings.hooks ?? {}) };
  const added: string[] = [];
  const alreadyPresent: string[] = [];

  for (const def of defs) {
    const existingGroups = hooks[def.event] ?? [];
    if (existingGroups.some((g) => groupHasCommand(g, def.command, resolve))) {
      alreadyPresent.push(def.event);
      continue;
    }
    const newGroup: HookGroup = { hooks: [{ type: "command", command: def.command }] };
    if (def.matcher) newGroup.matcher = def.matcher;
    hooks[def.event] = [...existingGroups, newGroup];
    added.push(def.event);
  }

  return { settings: { ...settings, hooks }, added, alreadyPresent };
}

export interface RemoveResult {
  settings: ClaudeSettings;
  removed: string[];
}

/**
 * Strips only the hook-groups whose command matches one of the given
 * definitions. Any other hook-group on the same event, and any other event
 * entirely, is left untouched. An event key is dropped once its array of
 * hook-groups becomes empty.
 */
export function removeHooks(
  settings: ClaudeSettings,
  defs: ResolvedHookDef[],
  resolve: PathResolver = identityResolver,
): RemoveResult {
  if (!settings.hooks) {
    return { settings, removed: [] };
  }

  const targets = new Set(defs.map((d) => resolveOrRaw(resolve, d.command)));
  const hooks: HooksConfig = {};
  const removed: string[] = [];

  for (const [event, groups] of Object.entries(settings.hooks)) {
    const kept = groups.filter((g) => {
      const isOurs = g.hooks.some((h) => targets.has(resolveOrRaw(resolve, h.command)));
      if (isOurs) removed.push(event);
      return !isOurs;
    });
    if (kept.length > 0) {
      hooks[event] = kept;
    }
  }

  return { settings: { ...settings, hooks }, removed };
}
