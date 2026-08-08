import express from "express";
import { createDb } from "./store/db.js";
import { createIngestHandler } from "./ingest/ingest.js";
import { createApiRouter } from "./api/routes.js";
import { handleSseConnection } from "./stream/broadcaster.js";

const PORT = Number(process.env.CLAUDEKANBAN_PORT ?? 4317);
const DB_PATH = process.env.CLAUDEKANBAN_DB_PATH ?? "claudekanban.db";

const db = createDb(DB_PATH);
const app = express();
app.use(express.json({ limit: "5mb" }));

app.post("/ingest", createIngestHandler(db));
app.use("/api", createApiRouter(db));
app.get("/stream", (_req, res) => handleSseConnection(res));

app.listen(PORT, () => {
  console.log(`claudekanban backend listening on http://localhost:${PORT}`);
});
