import type { Request, Response } from "express";
import type Database from "better-sqlite3";
import { insertEvent } from "../store/eventStore.js";
import { upsertSession, getSession } from "../store/sessionStore.js";
import { deriveStatus, type HookPayload } from "../domain/stateMachine.js";
import { synthesizeSubagentSession, type PostToolUsePayload } from "../domain/subagentSynthesis.js";
import { changeEmitter } from "../domain/changeEmitter.js";

export function createIngestHandler(db: Database.Database) {
  return function handleIngest(req: Request, res: Response): void {
    const payload = req.body as HookPayload | undefined;
    if (!payload || typeof payload.hook_event_name !== "string" || typeof payload.session_id !== "string") {
      res.status(400).json({ ok: false, error: "missing hook_event_name or session_id" });
      return;
    }

    const receivedAt = new Date().toISOString();
    insertEvent(db, payload.session_id, receivedAt, payload.hook_event_name, payload);

    const existing = getSession(db, payload.session_id);
    const status = deriveStatus(existing?.status, payload);
    upsertSession(db, {
      id: payload.session_id,
      parentSessionId: existing?.parentSessionId ?? null,
      owner: existing?.owner ?? "main",
      status,
      startedAt: existing?.startedAt ?? receivedAt,
      endedAt: status === "done" || status === "failed" ? receivedAt : null,
      cwd: payload.cwd ?? existing?.cwd ?? "",
      model: payload.model ?? existing?.model ?? null,
      recap: payload.hook_event_name === "Stop" ? payload.last_assistant_message ?? null : existing?.recap ?? null,
    });
    changeEmitter.emit("session-changed", payload.session_id);

    if (payload.hook_event_name === "PostToolUse") {
      const child = synthesizeSubagentSession(payload as PostToolUsePayload, receivedAt);
      if (child) {
        upsertSession(db, child);
        changeEmitter.emit("session-changed", child.id);
      }
    }

    res.status(200).json({ ok: true });
  };
}
