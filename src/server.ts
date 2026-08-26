import express from "express";
import { createDb } from "./store/db.js";
import { createIngestHandler } from "./ingest/ingest.js";
import { createApiRouter } from "./api/routes.js";
import { handleSseConnection } from "./stream/broadcaster.js";
import { runStaleSweep } from "./sweep/staleSweeper.js";
import { resolveActualPort } from "./resolveActualPort.js";

const PORT = Number(process.env.CLAUDEKANBAN_PORT ?? 4317);
const DB_PATH = process.env.CLAUDEKANBAN_DB_PATH ?? "claudekanban.db";
const STALE_TIMEOUT_MINUTES = Number(process.env.CLAUDEKANBAN_STALE_TIMEOUT_MINUTES ?? 10);
const STALE_SWEEP_INTERVAL_MS = 60_000;

const db = createDb(DB_PATH);
const app = express();
app.use(express.json({ limit: "5mb" }));

app.post("/ingest", createIngestHandler(db));
app.use("/api", createApiRouter(db));
app.get("/stream", (_req, res) => handleSseConnection(res));

setInterval(() => runStaleSweep(db, new Date().toISOString(), STALE_TIMEOUT_MINUTES), STALE_SWEEP_INTERVAL_MS);

const server = app.listen(PORT, () => {
  const actualPort = resolveActualPort(server);
  console.log(`claudekanban backend listening on http://localhost:${actualPort}`);
});
