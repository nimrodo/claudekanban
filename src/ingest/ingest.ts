import type { Request, Response } from "express";
import type Database from "better-sqlite3";
import { insertEvent } from "../store/eventStore.js";
import { upsertSession, getSession } from "../store/sessionStore.js";
import { deriveStatus, type HookPayload } from "../domain/stateMachine.js";
import {
  synthesizeSubagentSession,
  synthesizeSubagentStart,
  synthesizeSubagentStop,
  mergeSubagentTitle,
  type PostToolUsePayload,
  type SubagentStartPayload,
  type SubagentStopPayload,
} from "../domain/subagentSynthesis.js";
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
      title: existing?.title ?? null,
      status,
      startedAt: existing?.startedAt ?? receivedAt,
      endedAt: status === "done" || status === "failed" ? receivedAt : null,
      cwd: payload.cwd ?? existing?.cwd ?? "",
      model: payload.model ?? existing?.model ?? null,
      recap: payload.hook_event_name === "Stop" ? payload.last_assistant_message ?? null : existing?.recap ?? null,
    });
    changeEmitter.emit("session-changed", payload.session_id);

    if (payload.hook_event_name === "SubagentStart") {
      const startPayload = payload as SubagentStartPayload;
      const existingChild = startPayload.agent_id ? getSession(db, startPayload.agent_id) : undefined;
      const child = synthesizeSubagentStart(existingChild, startPayload, receivedAt);
      if (child) {
        upsertSession(db, child);
        changeEmitter.emit("session-changed", child.id);
      }
    }

    if (payload.hook_event_name === "SubagentStop") {
      const stopPayload = payload as SubagentStopPayload;
      if (stopPayload.agent_id && stopPayload.agent_type) {
        const existingChild = getSession(db, stopPayload.agent_id);
        if (existingChild) {
          const updated = synthesizeSubagentStop(existingChild, stopPayload, receivedAt);
          if (updated) {
            upsertSession(db, updated);
            changeEmitter.emit("session-changed", updated.id);
          }
        }
      }
    }

    if (payload.hook_event_name === "PostToolUse" && payload.tool_input) {
      const agentId = payload.tool_response?.agentId;
      if (agentId) {
        const existingChild = getSession(db, agentId);
        if (existingChild) {
          const merged = mergeSubagentTitle(existingChild, payload as PostToolUsePayload, receivedAt);
          upsertSession(db, merged);
          changeEmitter.emit("session-changed", merged.id);
        } else {
          const child = synthesizeSubagentSession(payload as PostToolUsePayload, receivedAt);
          if (child) {
            upsertSession(db, child);
            changeEmitter.emit("session-changed", child.id);
          }
        }
      }
    }

    res.status(200).json({ ok: true });
  };
}
