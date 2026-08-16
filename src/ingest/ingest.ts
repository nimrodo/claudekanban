import type { Request, Response } from "express";
import type Database from "better-sqlite3";
import { insertEvent } from "../store/eventStore.js";
import { getSession, type Session } from "../store/sessionStore.js";
import { applySessionChange } from "../store/applyChange.js";
import { deriveStatus, type HookPayload } from "../domain/stateMachine.js";
import { summarizeEvent } from "../domain/activitySummary.js";
import {
  synthesizeSubagentSession,
  synthesizeSubagentStart,
  synthesizeSubagentStop,
  mergeSubagentTitle,
  type PostToolUsePayload,
  type SubagentStartPayload,
  type SubagentStopPayload,
} from "../domain/subagentSynthesis.js";

export function createIngestHandler(db: Database.Database) {
  return function handleIngest(req: Request, res: Response): void {
    const payload = req.body as HookPayload | undefined;
    if (!payload || typeof payload.hook_event_name !== "string" || typeof payload.session_id !== "string") {
      res.status(400).json({ ok: false, error: "missing hook_event_name or session_id" });
      return;
    }

    const receivedAt = new Date().toISOString();
    const eventRecord = insertEvent(db, payload.session_id, receivedAt, payload.hook_event_name, payload);

    const existing = getSession(db, payload.session_id);
    const status = deriveStatus(existing?.status, payload);
    const updatedSession: Session = {
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
      failReason: existing?.failReason ?? null,
      lastActivitySummary: summarizeEvent(payload.hook_event_name, payload),
    };
    applySessionChange(db, updatedSession, receivedAt, eventRecord.id);

    if (payload.hook_event_name === "SubagentStart") {
      const startPayload = payload as SubagentStartPayload;
      const existingChild = startPayload.agent_id ? getSession(db, startPayload.agent_id) : undefined;
      const child = synthesizeSubagentStart(existingChild, startPayload, receivedAt);
      if (child) {
        applySessionChange(db, child, receivedAt, eventRecord.id);
      }
    }

    if (payload.hook_event_name === "SubagentStop") {
      const stopPayload = payload as SubagentStopPayload;
      if (stopPayload.agent_id && stopPayload.agent_type) {
        const existingChild = getSession(db, stopPayload.agent_id);
        if (existingChild) {
          const updated = synthesizeSubagentStop(existingChild, stopPayload, receivedAt);
          if (updated) {
            applySessionChange(db, updated, receivedAt, eventRecord.id);
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
          applySessionChange(db, merged, receivedAt, eventRecord.id);
        } else {
          const child = synthesizeSubagentSession(payload as PostToolUsePayload, receivedAt);
          if (child) {
            applySessionChange(db, child, receivedAt, eventRecord.id);
          }
        }
      }
    }

    res.status(200).json({ ok: true });
  };
}
