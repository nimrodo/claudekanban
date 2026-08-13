import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Drawer } from "./Drawer.js";
import type { EventDto, SessionDetailResponse } from "../lib/transport/Transport.js";

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

describe("Drawer", () => {
  it("shows a loading placeholder when loading and no detail yet", () => {
    render(<Drawer open detail={null} loading error={null} onClose={() => {}} />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("renders session metadata", () => {
    render(<Drawer open detail={detail()} loading={false} error={null} onClose={() => {}} />);
    expect(screen.getByText("Find TODO occurrences")).toBeInTheDocument();
    expect(screen.getByText("/tmp/project")).toBeInTheDocument();
    expect(screen.getByText("running")).toBeInTheDocument();
  });

  it("renders timeline entries newest-first with human-readable summaries", () => {
    render(<Drawer open detail={detail()} loading={false} error={null} onClose={() => {}} />);
    const summaries = screen.getAllByText(/Session started|Called Bash/);
    expect(summaries.map((el) => el.textContent)).toEqual(["Called Bash", "Session started"]);
  });

  it("reveals raw JSON for a timeline entry when its toggle is clicked", () => {
    render(<Drawer open detail={detail()} loading={false} error={null} onClose={() => {}} />);
    expect(screen.queryByText(/"tool_name"/)).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByText("Show raw")[0]);
    expect(screen.getByText(/"tool_name"/)).toBeInTheDocument();
  });

  it("renders one timeline icon per entry, keyed by iconKind", () => {
    render(<Drawer open detail={detail()} loading={false} error={null} onClose={() => {}} />);
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
    render(<Drawer open detail={detail({}, repeatedEvents)} loading={false} error={null} onClose={() => {}} />);

    expect(screen.getAllByText("Called Bash")).toHaveLength(1);
    expect(screen.getByText("×3")).toBeInTheDocument();

    fireEvent.click(screen.getAllByText("Show raw")[0]);
    expect(screen.getByText(/"ls"/)).toBeInTheDocument();
    expect(screen.getByText(/"pwd"/)).toBeInTheDocument();
    expect(screen.getByText(/"whoami"/)).toBeInTheDocument();
  });

  it("shows the failure reason when status is failed and failReason is set", () => {
    render(
      <Drawer
        open
        detail={detail({ status: "failed", failReason: "No activity for 30 minutes" })}
        loading={false}
        error={null}
        onClose={() => {}}
      />
    );
    expect(screen.getByText("No activity for 30 minutes")).toBeInTheDocument();
  });

  it("does not show a failure-reason section when status is failed but no reason was recorded", () => {
    render(<Drawer open detail={detail({ status: "failed", failReason: null })} loading={false} error={null} onClose={() => {}} />);
    expect(screen.queryByText("Failure reason")).not.toBeInTheDocument();
  });

  it("does not show a failure-reason section when status is not failed", () => {
    render(<Drawer open detail={detail({ status: "running", failReason: null })} loading={false} error={null} onClose={() => {}} />);
    expect(screen.queryByText("Failure reason")).not.toBeInTheDocument();
  });

  it("shows the recap when status is done and recap is set", () => {
    render(
      <Drawer
        open
        detail={detail({ status: "done", recap: "Found 2 files with TODOs." })}
        loading={false}
        error={null}
        onClose={() => {}}
      />
    );
    expect(screen.getByText("Found 2 files with TODOs.")).toBeInTheDocument();
  });

  it("does not show a recap section when status is not done", () => {
    render(<Drawer open detail={detail({ status: "running", recap: null })} loading={false} error={null} onClose={() => {}} />);
    expect(screen.queryByText("Recap")).not.toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(<Drawer open detail={detail()} loading={false} error={null} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when the overlay is clicked", () => {
    const onClose = vi.fn();
    const { container } = render(<Drawer open detail={detail()} loading={false} error={null} onClose={onClose} />);
    fireEvent.click(container.querySelector(".drawer-overlay")!);
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when Escape is pressed while open", () => {
    const onClose = vi.fn();
    render(<Drawer open detail={detail()} loading={false} error={null} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("does not respond to Escape when closed", () => {
    const onClose = vi.fn();
    render(<Drawer open={false} detail={detail()} loading={false} error={null} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("still shows a close button while loading with no detail yet", () => {
    const onClose = vi.fn();
    render(<Drawer open detail={null} loading error={null} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows an error message when the fetch failed", () => {
    render(<Drawer open detail={null} loading={false} error="Not found" onClose={() => {}} />);
    expect(screen.getByText(/couldn't load this session/i)).toBeInTheDocument();
    expect(screen.getByText("Not found")).toBeInTheDocument();
    expect(screen.getByLabelText("Close")).toBeInTheDocument();
  });

  it("moves focus to the close button when opened", async () => {
    const { rerender } = render(<Drawer open={false} detail={detail()} loading={false} error={null} onClose={() => {}} />);
    rerender(<Drawer open detail={detail()} loading={false} error={null} onClose={() => {}} />);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Close")));
  });
});
