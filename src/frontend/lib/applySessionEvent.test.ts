import { describe, expect, it } from "vitest";
import { applySessionEvent } from "./applySessionEvent.js";
import type { SessionDto } from "./transport/Transport.js";

function makeSession(id: string, overrides: Partial<SessionDto> = {}): SessionDto {
  return {
    id,
    parentSessionId: null,
    owner: "main",
    title: null,
    status: "running",
    startedAt: "2026-08-08T10:00:00.000Z",
    endedAt: null,
    cwd: "/tmp",
    model: null,
    recap: null,
    ...overrides,
  };
}

describe("applySessionEvent", () => {
  it("replaces a session in place when a patch matches an existing id", () => {
    const sessions = [makeSession("sess-1", { status: "running" }), makeSession("sess-2")];
    const patch = makeSession("sess-1", { status: "done" });
    const result = applySessionEvent(sessions, { type: "session-changed", entityId: "sess-1", patch });
    expect(result).toEqual([patch, makeSession("sess-2")]);
  });

  it("appends a session when the patch's id is not yet present", () => {
    const sessions = [makeSession("sess-1")];
    const patch = makeSession("sess-2");
    const result = applySessionEvent(sessions, { type: "session-changed", entityId: "sess-2", patch });
    expect(result).toEqual([makeSession("sess-1"), patch]);
  });

  it("no-ops and returns the same array reference when session-changed has no patch", () => {
    const sessions = [makeSession("sess-1")];
    const result = applySessionEvent(sessions, { type: "session-changed", entityId: "sess-1" });
    expect(result).toBe(sessions);
  });

  it("fully replaces the list on a resync event", () => {
    const sessions = [makeSession("sess-1")];
    const resynced = [makeSession("sess-2"), makeSession("sess-3")];
    const result = applySessionEvent(sessions, { type: "resync", sessions: resynced });
    expect(result).toBe(resynced);
  });
});
