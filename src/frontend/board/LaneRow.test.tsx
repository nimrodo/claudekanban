import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LaneRow } from "./LaneRow.js";
import type { Lane } from "./laneOrder.js";
import type { SessionDto, SessionStatus } from "../lib/transport/Transport.js";

function session(overrides: Partial<SessionDto>): SessionDto {
  return {
    id: "sess-1",
    parentSessionId: null,
    owner: "main",
    title: "Session",
    status: "running",
    startedAt: "2026-08-08T10:00:00.000Z",
    endedAt: null,
    cwd: "/tmp/project",
    model: null,
    recap: null,
    failReason: null,
    lastActivitySummary: null,
    lastActivityAt: null,
    ...overrides,
  };
}

function makeLane(overrides: Partial<Lane> = {}): Lane {
  const byStatus: Record<SessionStatus, SessionDto[]> = {
    queued: [],
    running: [],
    waiting: [],
    done: [],
    failed: [],
    ...overrides.byStatus,
  };
  return {
    cwd: "/home/user/myapp",
    label: "myapp",
    total: Object.values(byStatus).reduce((sum, arr) => sum + arr.length, 0),
    byStatus,
    childrenByParent: new Map(),
    ...overrides,
  };
}

const NOW = Date.now();

describe("LaneRow", () => {
  it("renders the lane label, full cwd as title, and session count", () => {
    const lane = makeLane({ cwd: "/home/user/myapp", label: "myapp", total: 3 });
    render(
      <LaneRow
        lane={lane}
        collapsed={false}
        onToggleCollapsed={() => {}}
        now={NOW}
        selectedId={null}
        onSelect={() => {}}
        expandedCells={new Set()}
        onToggleExpandedCell={() => {}}
      />
    );
    expect(screen.getByText("myapp")).toBeInTheDocument();
    expect(screen.getByText("myapp")).toHaveAttribute("title", "/home/user/myapp");
    expect(screen.getByText("3 sessions")).toBeInTheDocument();
  });

  it("renders 5 LaneCells when expanded", () => {
    const lane = makeLane();
    const { container } = render(
      <LaneRow
        lane={lane}
        collapsed={false}
        onToggleCollapsed={() => {}}
        now={NOW}
        selectedId={null}
        onSelect={() => {}}
        expandedCells={new Set()}
        onToggleExpandedCell={() => {}}
      />
    );
    expect(container.querySelectorAll(".lane-cell")).toHaveLength(5);
  });

  it("renders a collapsed strip instead of cells when collapsed", () => {
    const lane = makeLane({
      byStatus: {
        queued: [],
        running: [session({ status: "running" })],
        waiting: [],
        done: [session({ id: "d1", status: "done" })],
        failed: [],
      },
    });
    const { container } = render(
      <LaneRow
        lane={lane}
        collapsed={true}
        onToggleCollapsed={() => {}}
        now={NOW}
        selectedId={null}
        onSelect={() => {}}
        expandedCells={new Set()}
        onToggleExpandedCell={() => {}}
      />
    );
    expect(container.querySelectorAll(".lane-cell")).toHaveLength(0);
    expect(container.querySelectorAll(".lane-collapsed-pill")).toHaveLength(2);
  });

  it("collapsed strip omits pills for empty statuses", () => {
    const lane = makeLane({
      byStatus: {
        queued: [],
        running: [session({ status: "running" })],
        waiting: [],
        done: [],
        failed: [],
      },
    });
    const { container } = render(
      <LaneRow
        lane={lane}
        collapsed={true}
        onToggleCollapsed={() => {}}
        now={NOW}
        selectedId={null}
        onSelect={() => {}}
        expandedCells={new Set()}
        onToggleExpandedCell={() => {}}
      />
    );
    const pills = container.querySelectorAll(".lane-collapsed-pill");
    expect(pills).toHaveLength(1);
    expect(pills[0]).toHaveAttribute("data-status", "running");
  });

  it("the chevron button has aria-expanded reflecting the collapsed state", () => {
    const lane = makeLane();
    render(
      <LaneRow
        lane={lane}
        collapsed={true}
        onToggleCollapsed={() => {}}
        now={NOW}
        selectedId={null}
        onSelect={() => {}}
        expandedCells={new Set()}
        onToggleExpandedCell={() => {}}
      />
    );
    expect(screen.getByRole("button", { name: /expand lane/i })).toHaveAttribute("aria-expanded", "false");
  });

  it("clicking the chevron toggles collapse", () => {
    const onToggleCollapsed = vi.fn();
    const lane = makeLane();
    render(
      <LaneRow
        lane={lane}
        collapsed={false}
        onToggleCollapsed={onToggleCollapsed}
        now={NOW}
        selectedId={null}
        onSelect={() => {}}
        expandedCells={new Set()}
        onToggleExpandedCell={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /collapse lane/i }));
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
  });

  it("clicking the lane head name/sub-line region also toggles collapse", () => {
    const onToggleCollapsed = vi.fn();
    const lane = makeLane({ label: "myapp" });
    render(
      <LaneRow
        lane={lane}
        collapsed={false}
        onToggleCollapsed={onToggleCollapsed}
        now={NOW}
        selectedId={null}
        onSelect={() => {}}
        expandedCells={new Set()}
        onToggleExpandedCell={() => {}}
      />
    );
    fireEvent.click(screen.getByText("myapp"));
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
  });

  it("the chevron is a real <button> element", () => {
    const lane = makeLane();
    render(
      <LaneRow
        lane={lane}
        collapsed={false}
        onToggleCollapsed={() => {}}
        now={NOW}
        selectedId={null}
        onSelect={() => {}}
        expandedCells={new Set()}
        onToggleExpandedCell={() => {}}
      />
    );
    const chevron = screen.getByRole("button", { name: /collapse lane/i });
    expect(chevron.tagName).toBe("BUTTON");
  });

  it("passes expandedCells/onToggleExpandedCell through to the correct LaneCell", () => {
    const onToggleExpandedCell = vi.fn();
    const lane = makeLane({
      cwd: "/home/user/myapp",
      byStatus: {
        queued: [],
        running: [],
        waiting: [],
        done: Array.from({ length: 6 }, (_, i) => session({ id: `d${i}`, status: "done", endedAt: `2026-08-08T10:0${i}:00.000Z` })),
        failed: [],
      },
    });
    render(
      <LaneRow
        lane={lane}
        collapsed={false}
        onToggleCollapsed={() => {}}
        now={NOW}
        selectedId={null}
        onSelect={() => {}}
        expandedCells={new Set()}
        onToggleExpandedCell={onToggleExpandedCell}
      />
    );
    fireEvent.click(screen.getByText("+1 more"));
    expect(onToggleExpandedCell).toHaveBeenCalledWith("/home/user/myapp", "done");
  });
});
