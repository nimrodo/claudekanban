import { Router } from "express";
import type Database from "better-sqlite3";
import { getSession, listSessions } from "../store/sessionStore.js";
import { listEventsForSession } from "../store/eventStore.js";

export function createApiRouter(db: Database.Database): Router {
  const router = Router();

  router.get("/state", (_req, res) => {
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
