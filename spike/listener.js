const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 8787;
const captureFile = process.env.CAPTURE_FILE || "cli-hooks";
const captureDir = path.join(__dirname, "captures");
const capturePath = path.join(captureDir, `${captureFile}.jsonl`);

fs.mkdirSync(captureDir, { recursive: true });

const server = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/hook") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "not found" }));
    return;
  }

  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
  });

  req.on("end", () => {
    let body;
    try {
      body = raw.length > 0 ? JSON.parse(raw) : {};
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: `invalid JSON: ${err.message}` }));
      return;
    }

    const record = {
      receivedAt: new Date().toISOString(),
      headers: req.headers,
      body,
    };
    fs.appendFileSync(capturePath, `${JSON.stringify(record)}\n`);

    console.log(`[listener] captured ${body.hook_event_name || body.event || "event"} -> ${capturePath}`);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[listener] listening on http://127.0.0.1:${PORT}/hook, writing to ${capturePath}`);
});
