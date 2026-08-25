import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AttachPane, isEntryActive } from "./AttachPane.js";
import type { EventDto, SessionDetailResponse, SessionDto } from "../lib/transport/Transport.js";
import type { TimelineEntry } from "./eventSummary.js";

const NOW = new Date("2026-08-08T10:05:00.000Z").getTime();

function detail(
  overrides: Partial<SessionDetailResponse["session"]> = {},
  events?: EventDto[]
): SessionDetailResponse {
  return {
    session: {
      id: "sess-1",
      parentSessionId: null,
      owner: "main",
      title: "Find TODO occurrences",
      status: "running",
      startedAt: "2026-08-08T10:00:00.000Z",
      endedAt: null,
      cwd: "/tmp/project",
      model: "claude-sonnet-5",
      recap: null,
      failReason: null,
      lastActivitySummary: null,
      lastActivityAt: null,
      ...overrides,
    },
    events: events ?? [
      { id: 1, sessionId: "sess-1", ts: "2026-08-08T10:00:00.000Z", type: "SessionStart", payload: "{}" },
      {
        id: 2,
        sessionId: "sess-1",
        ts: "2026-08-08T10:00:05.000Z",
        type: "PostToolUse",
        payload: JSON.stringify({ tool_name: "Bash" }),
      },
    ],
  };
}

function renderPane(
  overrides: Partial<Parameters<typeof AttachPane>[0]> = {}
) {
  const defaults: Parameters<typeof AttachPane>[0] = {
    detail: detail(),
    loading: false,
    error: null,
    onClose: () => {},
    liveChildrenByParent: new Map(),
    now: NOW,
  };
  return render(<AttachPane {...defaults} {...overrides} />);
}

describe("AttachPane", () => {
  it("shows a loading placeholder when loading and no detail yet", () => {
    renderPane({ detail: null, loading: true });
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("renders session metadata", () => {
    renderPane();
    expect(screen.getByText("Find TODO occurrences")).toBeInTheDocument();
    expect(screen.getByText("project")).toBeInTheDocument();
    expect(screen.getByText("RUNNING", { exact: false })).toBeInTheDocument();
  });

  it("renders timeline entries newest-first with human-readable summaries", () => {
    renderPane();
    const summaries = screen.getAllByText(/Session started|Called Bash/);
    expect(summaries.map((el) => el.textContent)).toEqual(["Called Bash", "Session started"]);
  });

  it("reveals raw JSON for a timeline entry when its toggle is clicked", () => {
    renderPane();
    expect(screen.queryByText(/"tool_name"/)).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByText("Show raw")[0]);
    expect(screen.getByText(/"tool_name"/)).toBeInTheDocument();
  });

  it("renders one timeline icon per entry, keyed by iconKind", () => {
    renderPane();
    const icons = document.querySelectorAll(".timeline-icon");
    expect(Array.from(icons).map((el) => el.getAttribute("data-icon-kind"))).toEqual(["tool", "start"]);
  });

  it("collapses 3 consecutive identical tool calls into one row with a count badge, and shows all 3 raw payloads on expand", () => {
    const repeatedEvents: EventDto[] = [
      { id: 1, sessionId: "sess-1", ts: "2026-08-08T10:00:00.000Z", type: "SessionStart", payload: "{}" },
      { id: 2, sessionId: "sess-1", ts: "2026-08-08T10:00:01.000Z", type: "PostToolUse", payload: JSON.stringify({ tool_name: "Bash", tool_input: { command: "ls" } }) },
      { id: 3, sessionId: "sess-1", ts: "2026-08-08T10:00:02.000Z", type: "PostToolUse", payload: JSON.stringify({ tool_name: "Bash", tool_input: { command: "pwd" } }) },
      { id: 4, sessionId: "sess-1", ts: "2026-08-08T10:00:03.000Z", type: "PostToolUse", payload: JSON.stringify({ tool_name: "Bash", tool_input: { command: "whoami" } }) },
    ];
    renderPane({ detail: detail({}, repeatedEvents) });

    expect(screen.getAllByText("Called Bash")).toHaveLength(1);
    expect(screen.getByText("×3")).toBeInTheDocument();

    fireEvent.click(screen.getAllByText("Show raw")[0]);
    expect(screen.getByText(/"ls"/)).toBeInTheDocument();
    expect(screen.getByText(/"pwd"/)).toBeInTheDocument();
    expect(screen.getByText(/"whoami"/)).toBeInTheDocument();
  });

  it("shows the failure reason when status is failed and failReason is set", () => {
    renderPane({ detail: detail({ status: "failed", failReason: "No activity for 30 minutes" }) });
    expect(screen.getByText("No activity for 30 minutes")).toBeInTheDocument();
  });

  it("does not show a failure-reason section when status is failed but no reason was recorded", () => {
    renderPane({ detail: detail({ status: "failed", failReason: null }) });
    expect(screen.queryByText("Failure reason")).not.toBeInTheDocument();
  });

  it("does not show a failure-reason section when status is not failed", () => {
    renderPane({ detail: detail({ status: "running", failReason: null }) });
    expect(screen.queryByText("Failure reason")).not.toBeInTheDocument();
  });

  it("shows the recap when status is done and recap is set", () => {
    renderPane({ detail: detail({ status: "done", recap: "Found 2 files with TODOs." }) });
    expect(screen.getByText("Found 2 files with TODOs.")).toBeInTheDocument();
  });

  it("does not show a recap section when status is not done", () => {
    renderPane({ detail: detail({ status: "running", recap: null }) });
    expect(screen.queryByText("Recap")).not.toBeInTheDocument();
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    renderPane({ onClose });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when Escape is pressed while loading with no detail yet", () => {
    const onClose = vi.fn();
    renderPane({ detail: null, loading: true, onClose });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("shows an error message when the fetch failed", () => {
    renderPane({ detail: null, error: "Not found" });
    expect(screen.getByText(/couldn't load this session/i)).toBeInTheDocument();
    expect(screen.getByText("Not found")).toBeInTheDocument();
  });

  it("moves focus to the pane header when opened", async () => {
    renderPane();
    await waitFor(() => expect(document.activeElement).toHaveClass("attach-pane-header"));
  });

  it("renders role=complementary and aria-label='Attached session', not role=dialog", () => {
    renderPane();
    expect(screen.getByRole("complementary", { name: "Attached session" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders meta row with exactly project/events/model and no token/branch/sparkline text", () => {
    renderPane();
    expect(screen.getByText("project")).toBeInTheDocument();
    expect(screen.getByText("2 events")).toBeInTheDocument();
    expect(screen.getByText("claude-sonnet-5")).toBeInTheDocument();
    expect(screen.queryByText(/token/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/branch/i)).not.toBeInTheDocument();
  });

  it("renders one subagent row per live child under a single 'Task · n subagents' header", () => {
    const spawnEvents: EventDto[] = [
      { id: 1, sessionId: "sess-1", ts: "2026-08-08T10:00:00.000Z", type: "SessionStart", payload: "{}" },
      {
        id: 2,
        sessionId: "sess-1",
        ts: "2026-08-08T10:00:05.000Z",
        type: "PostToolUse",
        payload: JSON.stringify({ tool_name: "Task", tool_input: { subagent_type: "explore" } }),
      },
    ];
    const children: SessionDto[] = [
      {
        id: "child-1",
        parentSessionId: "sess-1",
        owner: "explore",
        title: null,
        status: "running",
        startedAt: "2026-08-08T10:00:06.000Z",
        endedAt: null,
        cwd: "/tmp/project",
        model: null,
        recap: null,
        failReason: null,
        lastActivitySummary: "Searching files",
        lastActivityAt: null,
      },
      {
        id: "child-2",
        parentSessionId: "sess-1",
        owner: "explore",
        title: null,
        status: "done",
        startedAt: "2026-08-08T10:00:06.000Z",
        endedAt: "2026-08-08T10:00:20.000Z",
        cwd: "/tmp/project",
        model: null,
        recap: null,
        failReason: null,
        lastActivitySummary: null,
        lastActivityAt: null,
      },
    ];
    renderPane({
      detail: detail({}, spawnEvents),
      liveChildrenByParent: new Map([["sess-1", children]]),
    });

    expect(screen.getByText("Task · 2 subagents")).toBeInTheDocument();
    expect(screen.queryAllByText("explore")).toHaveLength(2);
  });

  it("shows the progress bar and lastActivitySummary for a running child row", () => {
    const spawnEvents: EventDto[] = [
      { id: 1, sessionId: "sess-1", ts: "2026-08-08T10:00:00.000Z", type: "SessionStart", payload: "{}" },
      {
        id: 2,
        sessionId: "sess-1",
        ts: "2026-08-08T10:00:05.000Z",
        type: "PostToolUse",
        payload: JSON.stringify({ tool_name: "Task", tool_input: { subagent_type: "explore" } }),
      },
    ];
    const children: SessionDto[] = [
      {
        id: "child-1",
        parentSessionId: "sess-1",
        owner: "explore",
        title: null,
        status: "running",
        startedAt: "2026-08-08T10:00:06.000Z",
        endedAt: null,
        cwd: "/tmp/project",
        model: null,
        recap: null,
        failReason: null,
        lastActivitySummary: "Searching files",
        lastActivityAt: null,
      },
    ];
    renderPane({
      detail: detail({}, spawnEvents),
      liveChildrenByParent: new Map([["sess-1", children]]),
    });

    expect(document.querySelector(".subagent-progress-fill")).toBeInTheDocument();
    expect(screen.getByText("Searching files")).toBeInTheDocument();
  });
});

describe("isEntryActive", () => {
  const baseEntry: Omit<TimelineEntry, "id" | "iconKind"> = {
    ts: "2026-08-08T10:00:00.000Z",
    type: "PostToolUse",
    summary: "Called Bash",
    raw: [],
    count: 1,
  };

  function entry(id: number, iconKind: TimelineEntry["iconKind"]): TimelineEntry {
    return { ...baseEntry, id, iconKind };
  }

  it("newest non-spawn entry is active while the session is running", () => {
    const timeline = [entry(2, "tool"), entry(1, "start")];
    expect(isEntryActive(timeline[0], timeline, [], "running")).toBe(true);
  });

  it("newest spawn entry is active when it has a running child", () => {
    const timeline = [entry(2, "spawn"), entry(1, "start")];
    const children: SessionDto[] = [
      {
        id: "child-1",
        parentSessionId: "sess-1",
        owner: "explore",
        title: null,
        status: "running",
        startedAt: "2026-08-08T10:00:06.000Z",
        endedAt: null,
        cwd: "/tmp/project",
        model: null,
        recap: null,
        failReason: null,
        lastActivitySummary: null,
        lastActivityAt: null,
      },
    ];
    expect(isEntryActive(timeline[0], timeline, children, "running")).toBe(true);
  });

  it("spawn entry with no running children is not active", () => {
    const timeline = [entry(2, "spawn"), entry(1, "start")];
    const children: SessionDto[] = [
      {
        id: "child-1",
        parentSessionId: "sess-1",
        owner: "explore",
        title: null,
        status: "done",
        startedAt: "2026-08-08T10:00:06.000Z",
        endedAt: "2026-08-08T10:00:20.000Z",
        cwd: "/tmp/project",
        model: null,
        recap: null,
        failReason: null,
        lastActivitySummary: null,
        lastActivityAt: null,
      },
    ];
    expect(isEntryActive(timeline[0], timeline, children, "running")).toBe(false);
  });

  it("a non-newest non-spawn entry is never active regardless of session status", () => {
    const timeline = [entry(2, "tool"), entry(1, "start")];
    expect(isEntryActive(timeline[1], timeline, [], "running")).toBe(false);
    expect(isEntryActive(timeline[1], timeline, [], "done")).toBe(false);
  });
});
