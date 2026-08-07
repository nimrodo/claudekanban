import { query } from "@anthropic-ai/claude-agent-sdk";
import { appendFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const captureDir = path.join(__dirname, "captures");
const capturePath = path.join(captureDir, "agent-sdk.jsonl");
mkdirSync(captureDir, { recursive: true });

function capture(body) {
  appendFileSync(capturePath, `${JSON.stringify({ receivedAt: new Date().toISOString(), body })}\n`);
  console.log(`[agent-sdk-spike] captured ${body.hookEventName || body.type || "event"}`);
}

const hookCallback = (eventName) => async (input) => {
  capture({ hookEventName: eventName, input });
  return { continue: true };
};

const result = query({
  prompt:
    "Use the Explore agent to find where the word TODO appears in this repository, then tell me what it found.",
  options: {
    hooks: {
      SessionStart: [{ hooks: [hookCallback("SessionStart")] }],
      PostToolUse: [{ matcher: "*", hooks: [hookCallback("PostToolUse")] }],
      Stop: [{ hooks: [hookCallback("Stop")] }],
    },
  },
});

for await (const message of result) {
  capture({ hookEventName: "sdk_message", message });
}

console.log(`[agent-sdk-spike] done, captures at ${capturePath}`);
