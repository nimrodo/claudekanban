import { mkdirSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";

export function portFilePath(workspaceFolderPath: string): string {
  return path.join(workspaceFolderPath, ".claude", "claudekanban-port");
}

export function writePortFile(workspaceFolderPath: string, port: number): void {
  const filePath = portFilePath(workspaceFolderPath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, String(port), "utf-8");
}

export function removePortFile(workspaceFolderPath: string): void {
  const filePath = portFilePath(workspaceFolderPath);
  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
}
