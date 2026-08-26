import { join } from "node:path";
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import {
  HOOK_DEFS,
  mergeHooks,
  type ClaudeSettings,
  type ResolvedHookDef,
} from "../scripts/install-hooks-lib.js";

export function resolveSettingsPath(workspaceFolderPath: string): string {
  return join(workspaceFolderPath, ".claude", "settings.json");
}

export function resolveHookDefs(
  hooksDir: string,
  chmod: (path: string, mode: number) => void,
  realpath: (path: string) => string,
): ResolvedHookDef[] {
  return HOOK_DEFS.map((def) => {
    const scriptPath = join(hooksDir, def.scriptFile);
    try {
      chmod(scriptPath, 0o755);
    } catch {
      // Best-effort — a read-only filesystem shouldn't block hook installation.
    }
    return { ...def, command: realpath(scriptPath) };
  });
}

function readSettings(path: string): ClaudeSettings {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, "utf-8");
  if (raw.trim().length === 0) return {};
  return JSON.parse(raw) as ClaudeSettings;
}

function writeSettings(path: string, settings: ClaudeSettings): void {
  mkdirSync(join(path, ".."), { recursive: true });
  if (existsSync(path)) {
    copyFileSync(path, `${path}.bak`);
  }
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`, "utf-8");
}

export interface InstallHooksResult {
  settingsPath: string;
  added: string[];
  alreadyPresent: string[];
}

export function installHooksIntoWorkspace(
  workspaceFolderPath: string,
  hooksDir: string,
  chmod: (path: string, mode: number) => void,
  realpath: (path: string) => string,
): InstallHooksResult {
  const settingsPath = resolveSettingsPath(workspaceFolderPath);
  const defs = resolveHookDefs(hooksDir, chmod, realpath);
  const existing = readSettings(settingsPath);
  const { settings, added, alreadyPresent } = mergeHooks(existing, defs);

  if (added.length > 0) {
    writeSettings(settingsPath, settings);
  }

  return { settingsPath, added, alreadyPresent };
}
