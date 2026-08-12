import { Router } from "express";
import type Database from "better-sqlite3";
import { getSession, listSessions } from "../store/sessionStore.js";
import { listEventsForSession } from "../store/eventStore.js";

export function createApiRouter(db: Database.Database): Router {
  const router = Router();

  router.get("/state", (req, res) => {
    // Accepted but currently unused: v1 always returns the full snapshot, which trivially
    // "fills the gap" on reconnect at this app's scale. A true since-cursor delta isn't
    // worth the complexity yet (see docs/superpowers/specs/2026-08-07-operations-console-design.md,
    // "Real-time update design").
    void (req.query.since ? Number(req.query.since) : undefined);
    res.json({ sessions: listSessions(db) });
  });

  router.get("/sessions/:id", (req, res) => {
    const session = getSession(db, req.params.id);
    if (!session) {
      res.status(404).json({ ok: false, error: "not found" });
      return;
    }
    res.json({ session, events: listEventsForSession(db, session.id) });
  });

  return router;
}
