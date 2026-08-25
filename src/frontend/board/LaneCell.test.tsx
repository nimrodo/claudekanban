import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LaneCell } from "./LaneCell.js";
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

const NOW = new Date("2026-08-08T10:10:00.000Z").getTime();

function renderCell(
  status: SessionStatus,
  sessions: SessionDto[],
  overrides: Partial<{ expanded: boolean; onToggleExpanded: () => void; selectedId: string | null; onSelect: (id: string) => void }> = {}
) {
  return render(
    <LaneCell
      status={status}
      sessions={sessions}
      childrenByParent={new Map()}
      now={NOW}
      selectedId={overrides.selectedId ?? null}
      onSelect={overrides.onSelect ?? vi.fn()}
      expanded={overrides.expanded ?? false}
      onToggleExpanded={overrides.onToggleExpanded ?? vi.fn()}
    />
  );
}

describe("LaneCell", () => {
  it("renders an empty dash when there are no sessions and status is not waiting", () => {
    renderCell("running", []);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("does not render the empty dash for an empty waiting cell", () => {
    renderCell("waiting", []);
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("sorts running sessions by lastActivityAt descending, preferring it over startedAt", () => {
    const sessions = [
      session({ id: "a", title: "A", startedAt: "2026-08-08T10:00:00.000Z", lastActivityAt: "2026-08-08T10:01:00.000Z" }),
      session({ id: "b", title: "B", startedAt: "2026-08-08T10:00:00.000Z", lastActivityAt: "2026-08-08T10:05:00.000Z" }),
    ];
    renderCell("running", sessions);
    const titles = screen.getAllByText(/^[AB]$/).map((el) => el.textContent);
    expect(titles).toEqual(["B", "A"]);
  });

  it("sorts running sessions by startedAt when lastActivityAt is null", () => {
    const sessions = [
      session({ id: "a", title: "A", startedAt: "2026-08-08T10:00:00.000Z", lastActivityAt: null }),
      session({ id: "b", title: "B", startedAt: "2026-08-08T10:05:00.000Z", lastActivityAt: null }),
    ];
    renderCell("running", sessions);
    const titles = screen.getAllByText(/^[AB]$/).map((el) => el.textContent);
    expect(titles).toEqual(["B", "A"]);
  });

  it("sorts queued sessions by startedAt ascending", () => {
    const sessions = [
      session({ id: "a", title: "A", status: "queued", startedAt: "2026-08-08T10:05:00.000Z" }),
      session({ id: "b", title: "B", status: "queued", startedAt: "2026-08-08T10:00:00.000Z" }),
    ];
    renderCell("queued", sessions);
    expect(screen.getByText("#1 · queued 10m 0s")).toBeInTheDocument();
    expect(screen.getByText("#2 · queued 5m 0s")).toBeInTheDocument();
  });

  it("sorts done sessions by endedAt descending", () => {
    const sessions = [
      session({ id: "a", title: "A", status: "done", endedAt: "2026-08-08T10:01:00.000Z" }),
      session({ id: "b", title: "B", status: "done", endedAt: "2026-08-08T10:05:00.000Z" }),
    ];
    renderCell("done", sessions);
    const titles = screen.getAllByText(/^[AB]$/).map((el) => el.textContent);
    expect(titles).toEqual(["B", "A"]);
  });

  it("caps at 5 for non-failed statuses and shows a +N more toggle", () => {
    const sessions = Array.from({ length: 8 }, (_, i) =>
      session({ id: `s${i}`, title: `S${i}`, status: "done", endedAt: `2026-08-08T10:0${i}:00.000Z` })
    );
    renderCell("done", sessions);
    expect(screen.getAllByText(/^S\d$/)).toHaveLength(5);
    expect(screen.getByText("+3 more")).toBeInTheDocument();
  });

  it("shows all sessions and 'show less' when expanded", () => {
    const sessions = Array.from({ length: 8 }, (_, i) =>
      session({ id: `s${i}`, title: `S${i}`, status: "done", endedAt: `2026-08-08T10:0${i}:00.000Z` })
    );
    renderCell("done", sessions, { expanded: true });
    expect(screen.getAllByText(/^S\d$/)).toHaveLength(8);
    expect(screen.getByText("show less")).toBeInTheDocument();
  });

  it("never caps failed sessions even with more than 5", () => {
    const sessions = Array.from({ length: 7 }, (_, i) =>
      session({ id: `s${i}`, title: `S${i}`, status: "failed", endedAt: `2026-08-08T10:0${i}:00.000Z`, failReason: "oops" })
    );
    renderCell("failed", sessions);
    expect(screen.getAllByText(/^S\d$/)).toHaveLength(7);
    expect(screen.queryByText(/more/)).not.toBeInTheDocument();
  });

  it("calls onToggleExpanded when the overflow toggle is clicked", () => {
    const onToggleExpanded = vi.fn();
    const sessions = Array.from({ length: 6 }, (_, i) =>
      session({ id: `s${i}`, title: `S${i}`, status: "done", endedAt: `2026-08-08T10:0${i}:00.000Z` })
    );
    renderCell("done", sessions, { onToggleExpanded });
    fireEvent.click(screen.getByText("+1 more"));
    expect(onToggleExpanded).toHaveBeenCalled();
  });

  it("assigns 1-based queuePosition matching queue order", () => {
    const sessions = [
      session({ id: "a", title: "A", status: "queued", startedAt: "2026-08-08T10:00:00.000Z" }),
      session({ id: "b", title: "B", status: "queued", startedAt: "2026-08-08T10:02:00.000Z" }),
    ];
    renderCell("queued", sessions);
    expect(screen.getByText(/^#1/)).toBeInTheDocument();
    expect(screen.getByText(/^#2/)).toBeInTheDocument();
  });
});
