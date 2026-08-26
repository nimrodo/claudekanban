import { createServer } from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

export function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on("error", reject);
    probe.listen(0, () => {
      const address = probe.address();
      if (address === null || typeof address === "string") {
        reject(new Error("Failed to allocate a free port"));
        return;
      }
      const { port } = address;
      probe.close(() => resolve(port));
    });
  });
}

async function waitForReady(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/api/state`);
      if (res.ok) return;
    } catch {
      // server not up yet, keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Managed server did not become ready on port ${port} within ${timeoutMs}ms`);
}

export interface ManagedServerHandle {
  port: number;
  process: ChildProcess;
}

export async function startManagedServer(extensionRoot: string, dbPath: string): Promise<ManagedServerHandle> {
  const port = await getFreePort();
  const serverEntry = path.join(extensionRoot, "dist-server", "server.js");

  const child = spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      CLAUDEKANBAN_PORT: String(port),
      CLAUDEKANBAN_DB_PATH: dbPath,
    },
    stdio: "pipe",
  });

  await waitForReady(port, 10_000);

  return { port, process: child };
}

export function stopManagedServer(handle: ManagedServerHandle): void {
  handle.process.kill();
}

export function extensionRootFromModuleUrl(moduleUrl: string): string {
  return path.resolve(path.dirname(fileURLToPath(moduleUrl)), "..");
}
