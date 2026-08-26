import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { portFilePath, writePortFile, removePortFile } from "./portFile.js";

describe("portFile", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("writes the port to .claude/claudekanban-port under the workspace folder", () => {
    dir = mkdtempSync(path.join(tmpdir(), "ck-portfile-"));

    writePortFile(dir, 51234);

    const written = readFileSync(portFilePath(dir), "utf-8");
    expect(written).toBe("51234");
  });

  it("creates the .claude directory if it doesn't exist", () => {
    dir = mkdtempSync(path.join(tmpdir(), "ck-portfile-"));

    expect(() => writePortFile(dir, 4000)).not.toThrow();
    expect(existsSync(portFilePath(dir))).toBe(true);
  });

  it("removePortFile deletes the file if present and is a no-op otherwise", () => {
    dir = mkdtempSync(path.join(tmpdir(), "ck-portfile-"));
    writePortFile(dir, 4000);

    removePortFile(dir);
    expect(existsSync(portFilePath(dir))).toBe(false);

    expect(() => removePortFile(dir)).not.toThrow();
  });
});
