import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve as resolvePath } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import {
  HOOK_DEFS,
  type ClaudeSettings,
  type ResolvedHookDef,
  mergeHooks,
  removeHooks,
} from "./install-hooks-lib.js";

const repoRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");
const hooksDir = join(repoRoot, "hooks");

interface Args {
  target: "user" | "project" | null;
  path: string | null;
  dryRun: boolean;
  remove: boolean;
  yes: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { target: null, path: null, dryRun: false, remove: false, yes: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--user":
        args.target = "user";
        break;
      case "--project":
        args.target = "project";
        break;
      case "--path":
        args.path = argv[++i] ?? null;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--remove":
        args.remove = true;
        break;
      case "--yes":
      case "-y":
        args.yes = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function printHelp(): void {
  console.log(`Usage: npm run hooks:install -- [options]

Merges the claudekanban hook entries (SessionStart, PostToolUse, Stop,
SubagentStart, SubagentStop, Notification, PermissionRequest) into a
Claude Code settings.json, without touching any other hooks already
registered there.

Options:
  --user            Target the user-level settings.json (~/.claude or $CLAUDE_CONFIG_DIR)
  --project         Target this repo's .claude/settings.json
  --path <file>     Target a specific settings.json path
  --dry-run         Preview changes without writing anything
  --remove          Uninstall claudekanban's hook entries instead of installing
  --yes, -y         Skip the confirm prompt (required if stdin isn't a TTY)
  --help, -h        Show this help and exit`);
}

async function resolveSettingsPath(args: Args): Promise<string> {
  if (args.path) return resolvePath(args.path);

  if (args.target === "project") return join(repoRoot, ".claude", "settings.json");
  if (args.target === "user") {
    const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
    return join(configDir, "settings.json");
  }

  if (!process.stdin.isTTY) {
    console.error(
      "No target specified and input isn't interactive. Pass --user, --project, or --path explicitly.",
    );
    process.exit(1);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question("Install into (u)ser-level or (p)roject-level settings.json? [u/p]: "))
      .trim()
      .toLowerCase();
    if (answer === "u" || answer === "user") {
      const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
      return join(configDir, "settings.json");
    }
    if (answer === "p" || answer === "project") {
      return join(repoRoot, ".claude", "settings.json");
    }
    console.error(`Unrecognized answer: "${answer}"`);
    process.exit(1);
  } finally {
    rl.close();
  }
}

function resolvedHookDefs(): ResolvedHookDef[] {
  return HOOK_DEFS.map((def) => {
    const scriptPath = join(hooksDir, def.scriptFile);
    try {
      chmodSync(scriptPath, 0o755);
    } catch {
      console.warn(`Warning: could not chmod +x ${scriptPath}`);
    }
    return { ...def, command: realpathSync(scriptPath) };
  });
}

function readSettings(path: string): ClaudeSettings {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, "utf-8");
  if (raw.trim().length === 0) return {};
  try {
    return JSON.parse(raw) as ClaudeSettings;
  } catch (err) {
    throw new Error(`Failed to parse ${path} as JSON: ${(err as Error).message}`);
  }
}

async function confirm(args: Args, message: string): Promise<boolean> {
  if (args.yes) return true;
  if (!process.stdin.isTTY) {
    console.error(`${message}\nInput isn't interactive — pass --yes to confirm non-interactively.`);
    return false;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`${message} [y/N]: `)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

function writeSettings(path: string, settings: ClaudeSettings): void {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) {
    copyFileSync(path, `${path}.bak`);
  }
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`, "utf-8");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  const settingsPath = await resolveSettingsPath(args);
  const defs = resolvedHookDefs();
  const existing = readSettings(settingsPath);

  if (args.remove) {
    const { settings, removed } = removeHooks(existing, defs);
    if (removed.length === 0) {
      console.log(`No claudekanban hooks found in ${settingsPath}. Nothing to do.`);
      return;
    }
    console.log(`Will remove claudekanban hooks for: ${removed.join(", ")}`);
    if (args.dryRun) {
      console.log(`(dry run — ${settingsPath} not modified)`);
      return;
    }
    if (!(await confirm(args, `Write changes to ${settingsPath}?`))) {
      console.log("Aborted.");
      return;
    }
    writeSettings(settingsPath, settings);
    console.log(`Removed claudekanban hooks from ${settingsPath} (backup at ${settingsPath}.bak).`);
    return;
  }

  const { settings, added, alreadyPresent } = mergeHooks(existing, defs);
  if (added.length === 0) {
    console.log(`All claudekanban hooks already present in ${settingsPath}. Nothing to do.`);
    return;
  }
  console.log(`Will add claudekanban hooks for: ${added.join(", ")}`);
  if (alreadyPresent.length > 0) {
    console.log(`Already present, skipping: ${alreadyPresent.join(", ")}`);
  }
  if (args.dryRun) {
    console.log(`(dry run — ${settingsPath} not modified)`);
    return;
  }
  if (!(await confirm(args, `Write changes to ${settingsPath}?`))) {
    console.log("Aborted.");
    return;
  }
  writeSettings(settingsPath, settings);
  console.log(`Wrote claudekanban hooks to ${settingsPath} (backup at ${settingsPath}.bak).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
