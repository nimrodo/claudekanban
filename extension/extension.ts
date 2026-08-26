import * as vscode from "vscode";
import { chmodSync, mkdirSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { startManagedServer, stopManagedServer, type ManagedServerHandle } from "./managedServer.js";
import { buildHtml } from "./boardPanel.js";
import { installHooksIntoWorkspace } from "./installHooks.js";

let managedServer: ManagedServerHandle | undefined;
let boardPanel: vscode.WebviewPanel | undefined;

function resolveDbPath(context: vscode.ExtensionContext, workspaceFolder: vscode.WorkspaceFolder): string {
  const configured = vscode.workspace.getConfiguration("claudekanban").get<string>("dbPath");
  if (configured) return configured;

  const storageDir = context.storageUri?.fsPath ?? context.globalStorageUri.fsPath;
  mkdirSync(storageDir, { recursive: true });
  return path.join(storageDir, `${workspaceFolder.name}.db`);
}

async function openBoard(context: vscode.ExtensionContext): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage("ClaudeKanban: open a workspace folder first.");
    return;
  }

  if (boardPanel) {
    boardPanel.reveal();
    return;
  }

  if (!managedServer) {
    const dbPath = resolveDbPath(context, workspaceFolder);
    try {
      managedServer = await startManagedServer(context.extensionUri.fsPath, dbPath);
    } catch (err) {
      vscode.window.showErrorMessage(`ClaudeKanban: failed to start the managed server: ${(err as Error).message}`);
      return;
    }
  }

  try {
    const panel = vscode.window.createWebviewPanel(
      "claudekanban.board",
      "ClaudeKanban",
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true },
    );

    const distUri = vscode.Uri.joinPath(context.extensionUri, "dist");
    const assetsDir = path.join(distUri.fsPath, "assets");
    const assetFiles = readdirSync(assetsDir);

    const scriptUris = assetFiles
      .filter((f) => f.endsWith(".js"))
      .map((f) => panel.webview.asWebviewUri(vscode.Uri.joinPath(distUri, "assets", f)).toString());
    const styleUris = assetFiles
      .filter((f) => f.endsWith(".css"))
      .map((f) => panel.webview.asWebviewUri(vscode.Uri.joinPath(distUri, "assets", f)).toString());

    panel.webview.html = buildHtml({
      scriptUris,
      styleUris,
      cspSource: panel.webview.cspSource,
      port: managedServer.port,
    });

    panel.onDidDispose(() => {
      boardPanel = undefined;
    });

    boardPanel = panel;
  } catch (err) {
    vscode.window.showErrorMessage(`ClaudeKanban: failed to open the board panel: ${(err as Error).message}`);
  }
}

function installHooks(context: vscode.ExtensionContext): void {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage("ClaudeKanban: open a workspace folder first.");
    return;
  }

  const hooksDir = vscode.Uri.joinPath(context.extensionUri, "hooks").fsPath;
  const result = installHooksIntoWorkspace(workspaceFolder.uri.fsPath, hooksDir, chmodSync, realpathSync);

  if (result.added.length === 0) {
    vscode.window.showInformationMessage(`ClaudeKanban: all hooks already present in ${result.settingsPath}.`);
    return;
  }
  vscode.window.showInformationMessage(
    `ClaudeKanban: installed hooks for ${result.added.join(", ")} in ${result.settingsPath}.`,
  );
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("claudekanban.openBoard", () => openBoard(context)),
    vscode.commands.registerCommand("claudekanban.installHooks", () => installHooks(context)),
  );
}

export function deactivate(): void {
  if (managedServer) {
    stopManagedServer(managedServer);
    managedServer = undefined;
  }
}
