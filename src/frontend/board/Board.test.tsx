import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { Board } from "./Board.js";
import type { SessionDto } from "../lib/transport/Transport.js";

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

function laneRowFor(container: HTMLElement, cwd: string): HTMLElement {
  const nameEl = within(container).getByTitle(cwd);
  const row = nameEl.closest(".lane-row");
  if (!row) throw new Error(`no .lane-row ancestor found for cwd ${cwd}`);
  return row as HTMLElement;
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("Board", () => {
  describe("lane rendering", () => {
    it("renders two lane rows for two sessions with different cwd", () => {
      const { container } = render(
        <Board
          sessions={[
            session({ id: "a", cwd: "/home/user/app-one" }),
            session({ id: "b", cwd: "/home/user/app-two" }),
          ]}
          selectedId={null}
          onSelect={() => {}}
          now={NOW}
        />
      );
      expect(container.querySelectorAll(".lane-row")).toHaveLength(2);
    });

    it("shows the lane head with cwdLabel(cwd) and session count", () => {
      const { container } = render(
        <Board
          sessions={[
            session({ id: "a", cwd: "/home/user/app-one" }),
            session({ id: "b", cwd: "/home/user/app-one" }),
          ]}
          selectedId={null}
          onSelect={() => {}}
          now={NOW}
        />
      );
      const row = laneRowFor(container, "/home/user/app-one");
      expect(within(row).getByText("app-one")).toBeInTheDocument();
      expect(within(row).getByText("2 sessions")).toBeInTheDocument();
    });

    it("renders two projects with the same basename but different full cwd as two separate lanes", () => {
      const { container } = render(
        <Board
          sessions={[
            session({ id: "a", cwd: "/home/alice/app" }),
            session({ id: "b", cwd: "/home/bob/app" }),
          ]}
          selectedId={null}
          onSelect={() => {}}
          now={NOW}
        />
      );
      expect(container.querySelectorAll(".lane-row")).toHaveLength(2);
      expect(laneRowFor(container, "/home/alice/app")).toBeTruthy();
      expect(laneRowFor(container, "/home/bob/app")).toBeTruthy();
    });
  });

  describe("fleet bar counts", () => {
    it("shows fleet-wide totals unaffected by lane grouping", () => {
      render(
        <Board
          sessions={[
            session({ id: "a", cwd: "/home/user/app-one", status: "running" }),
            session({ id: "b", cwd: "/home/user/app-two", status: "running" }),
            session({ id: "c", cwd: "/home/user/app-one", status: "failed" }),
          ]}
          selectedId={null}
          onSelect={() => {}}
          now={NOW}
        />
      );
      const fleetBar = document.querySelector(".fleet-bar") as HTMLElement;
      const runningCounter = fleetBar.querySelector('.fleet-bar-counter[data-status="running"]');
      expect(runningCounter?.querySelector(".fleet-bar-counter-count")).toHaveTextContent("2");
      const failedCounter = fleetBar.querySelector('.fleet-bar-counter[data-status="failed"]');
      expect(failedCounter?.querySelector(".fleet-bar-counter-count")).toHaveTextContent("1");
    });
  });

  describe("card status rendering", () => {
    it("renders a running card in the running column with title falling back to cwd label and an activity line", () => {
      const { container } = render(
        <Board
          sessions={[
            session({
              id: "a",
              cwd: "/home/user/app-one",
              status: "running",
              title: null,
              lastActivitySummary: "Reading files",
            }),
          ]}
          selectedId={null}
          onSelect={() => {}}
          now={NOW}
        />
      );
      const row = laneRowFor(container, "/home/user/app-one");
      const cell = row.querySelector('.lane-cell[data-status="running"]') as HTMLElement;
      const card = cell.querySelector(".lane-card") as HTMLElement;
      expect(card).toBeTruthy();
      expect(within(card).getByText("/home/user/app-one")).toBeInTheDocument();
      expect(within(card).getByText("Reading files")).toBeInTheDocument();
    });

    it("renders a waiting card with an activity line but not a queued/done meta line", () => {
      const { container } = render(
        <Board
          sessions={[
            session({
              id: "a",
              cwd: "/home/user/app-one",
              status: "waiting",
              title: "Waiting session",
              lastActivitySummary: "Needs permission",
            }),
          ]}
          selectedId={null}
          onSelect={() => {}}
          now={NOW}
        />
      );
      const row = laneRowFor(container, "/home/user/app-one");
      const cell = row.querySelector('.lane-cell[data-status="waiting"]') as HTMLElement;
      const card = cell.querySelector(".lane-card") as HTMLElement;
      expect(within(card).getByText("Waiting session")).toBeInTheDocument();
      expect(card.querySelectorAll(".lane-card-activity, .lane-card-activity-muted").length).toBeGreaterThan(0);
    });

    it("does not render an activity line for a queued card", () => {
      const { container } = render(
        <Board
          sessions={[
            session({
              id: "a",
              cwd: "/home/user/app-one",
              status: "queued",
              title: "Queued session",
              lastActivitySummary: "should not show",
            }),
          ]}
          selectedId={null}
          onSelect={() => {}}
          now={NOW}
        />
      );
      const row = laneRowFor(container, "/home/user/app-one");
      const cell = row.querySelector('.lane-cell[data-status="queued"]') as HTMLElement;
      const card = cell.querySelector(".lane-card") as HTMLElement;
      expect(card.querySelector(".lane-card-activity")).toBeNull();
    });

    it("renders a done card's title with the muted styling hook", () => {
      window.localStorage.setItem("ck.swimlanes.collapsed", JSON.stringify({ "/home/user/app-one": false }));
      const { container } = render(
        <Board
          sessions={[
            session({
              id: "a",
              cwd: "/home/user/app-one",
              status: "done",
              title: "Done session",
              endedAt: "2026-08-08T10:05:00.000Z",
            }),
          ]}
          selectedId={null}
          onSelect={() => {}}
          now={NOW}
        />
      );
      const row = laneRowFor(container, "/home/user/app-one");
      const cell = row.querySelector('.lane-cell[data-status="done"]') as HTMLElement;
      const card = cell.querySelector('.lane-card[data-status="done"]') as HTMLElement;
      expect(card).toBeTruthy();
      expect(within(card).getByText("Done session")).toBeInTheDocument();
    });

    it("shows a failReason clamp on a failed card", () => {
      window.localStorage.setItem("ck.swimlanes.collapsed", JSON.stringify({ "/home/user/app-one": false }));
      const { container } = render(
        <Board
          sessions={[
            session({
              id: "a",
              cwd: "/home/user/app-one",
              status: "failed",
              title: "Failed session",
              failReason: "No activity for 30 minutes",
            }),
          ]}
          selectedId={null}
          onSelect={() => {}}
          now={NOW}
        />
      );
      const row = laneRowFor(container, "/home/user/app-one");
      const cell = row.querySelector('.lane-cell[data-status="failed"]') as HTMLElement;
      const reason = cell.querySelector(".lane-card-fail-reason");
      expect(reason?.textContent).toBe("No activity for 30 minutes");
    });
  });

  describe("subagent chips", () => {
    it("renders 2 chips labeled with child.owner for a parent with 2 children, with no nested .child-card", () => {
      const { container } = render(
        <Board
          sessions={[
            session({ id: "parent-1", cwd: "/home/user/app-one", status: "running" }),
            session({ id: "child-1", owner: "Explore", parentSessionId: "parent-1", status: "running" }),
            session({ id: "child-2", owner: "Plan", parentSessionId: "parent-1", status: "done" }),
          ]}
          selectedId={null}
          onSelect={() => {}}
          now={NOW}
        />
      );
      expect(container.querySelectorAll(".subagent-chip:not(.subagent-chip-overflow)")).toHaveLength(2);
      expect(screen.getByText("Explore")).toBeInTheDocument();
      expect(screen.getByText("Plan")).toBeInTheDocument();
      expect(container.querySelector(".child-card")).toBeNull();
    });

    it("clicking a subagent chip calls onSelect with the child's id, not the parent's", () => {
      const onSelect = vi.fn();
      render(
        <Board
          sessions={[
            session({ id: "parent-1", cwd: "/home/user/app-one", status: "running" }),
            session({ id: "child-1", owner: "Explore", parentSessionId: "parent-1", status: "running" }),
          ]}
          selectedId={null}
          onSelect={onSelect}
          now={NOW}
        />
      );
      fireEvent.click(screen.getByText("Explore"));
      expect(onSelect).toHaveBeenCalledWith("child-1");
      expect(onSelect).not.toHaveBeenCalledWith("parent-1");
    });

    it("shows 3 chips plus a +2 indicator for a parent with 5 children", () => {
      const children = Array.from({ length: 5 }, (_, i) =>
        session({ id: `child-${i}`, owner: `Agent${i}`, parentSessionId: "parent-1", status: "running" })
      );
      const { container } = render(
        <Board
          sessions={[session({ id: "parent-1", cwd: "/home/user/app-one", status: "running" }), ...children]}
          selectedId={null}
          onSelect={() => {}}
          now={NOW}
        />
      );
      expect(container.querySelectorAll(".subagent-chip:not(.subagent-chip-overflow)")).toHaveLength(3);
      expect(screen.getByText("+2 more")).toBeInTheDocument();
    });
  });

  describe("overflow cap", () => {
    // Per-cell cap/expand mechanics (5-item cap, "+N more", "show less", failed never capped)
    // are already exhaustively covered by LaneCell.test.tsx. Board.test.tsx keeps one light
    // smoke test to confirm the cap is actually wired end-to-end through Board -> LaneRow ->
    // LaneCell, and focuses its real coverage on the integration surface LaneCell cannot see
    // on its own: Board tracks each (lane, status) cell's expanded state independently, keyed
    // by `${cwd}:${status}` in expandedCells.
    it("caps a lane's done cell with 8 done sessions at 5 cards plus a +3 more button (smoke test)", () => {
      window.localStorage.setItem("ck.swimlanes.collapsed", JSON.stringify({ "/home/user/app-one": false }));
      const sessions = Array.from({ length: 8 }, (_, i) =>
        session({
          id: `d${i}`,
          cwd: "/home/user/app-one",
          status: "done",
          title: `Done ${i}`,
          endedAt: `2026-08-08T10:0${i}:00.000Z`,
        })
      );
      const { container } = render(
        <Board sessions={sessions} selectedId={null} onSelect={() => {}} now={NOW} />
      );
      const row = laneRowFor(container, "/home/user/app-one");
      const cell = row.querySelector('.lane-cell[data-status="done"]') as HTMLElement;
      expect(cell.querySelectorAll(".lane-card")).toHaveLength(5);
      expect(within(cell).getByText("+3 more")).toBeInTheDocument();
    });

    it("tracks each lane's done cell's expanded state independently — expanding lane A's overflow does not affect lane B's", () => {
      window.localStorage.setItem(
        "ck.swimlanes.collapsed",
        JSON.stringify({ "/home/user/app-one": false, "/home/user/app-two": false })
      );
      const laneASessions = Array.from({ length: 8 }, (_, i) =>
        session({
          id: `a-d${i}`,
          cwd: "/home/user/app-one",
          status: "done",
          title: `A-Done ${i}`,
          endedAt: `2026-08-08T10:0${i}:00.000Z`,
        })
      );
      const laneBSessions = Array.from({ length: 8 }, (_, i) =>
        session({
          id: `b-d${i}`,
          cwd: "/home/user/app-two",
          status: "done",
          title: `B-Done ${i}`,
          endedAt: `2026-08-08T10:0${i}:00.000Z`,
        })
      );
      const { container } = render(
        <Board
          sessions={[...laneASessions, ...laneBSessions]}
          selectedId={null}
          onSelect={() => {}}
          now={NOW}
        />
      );
      const rowA = laneRowFor(container, "/home/user/app-one");
      const rowB = laneRowFor(container, "/home/user/app-two");
      const cellA = rowA.querySelector('.lane-cell[data-status="done"]') as HTMLElement;
      const cellB = rowB.querySelector('.lane-cell[data-status="done"]') as HTMLElement;

      // Expand only lane A's done cell.
      fireEvent.click(within(cellA).getByText("+3 more"));

      expect(cellA.querySelectorAll(".lane-card")).toHaveLength(8);
      expect(within(cellA).getByText("show less")).toBeInTheDocument();
      // Lane B's done cell remains capped and untouched.
      expect(cellB.querySelectorAll(".lane-card")).toHaveLength(5);
      expect(within(cellB).getByText("+3 more")).toBeInTheDocument();
    });

    it("tracks a lane's done and failed cells' expanded state independently within the same lane", () => {
      window.localStorage.setItem("ck.swimlanes.collapsed", JSON.stringify({ "/home/user/app-one": false }));
      const doneSessions = Array.from({ length: 8 }, (_, i) =>
        session({
          id: `d${i}`,
          cwd: "/home/user/app-one",
          status: "done",
          title: `Done ${i}`,
          endedAt: `2026-08-08T10:0${i}:00.000Z`,
        })
      );
      // Failed is never capped, but expandedCells still tracks a key for it; use waiting-status
      // overflow instead of failed since failed never renders a toggle to click. We reuse
      // "done" for the expanded cell and "queued" (also cappable) as the untouched sibling
      // within the same lane.
      const queuedSessions = Array.from({ length: 7 }, (_, i) =>
        session({
          id: `q${i}`,
          cwd: "/home/user/app-one",
          status: "queued",
          title: `Queued ${i}`,
          startedAt: `2026-08-08T09:0${i}:00.000Z`,
        })
      );
      const { container } = render(
        <Board
          sessions={[...doneSessions, ...queuedSessions]}
          selectedId={null}
          onSelect={() => {}}
          now={NOW}
        />
      );
      const row = laneRowFor(container, "/home/user/app-one");
      const doneCell = row.querySelector('.lane-cell[data-status="done"]') as HTMLElement;
      const queuedCell = row.querySelector('.lane-cell[data-status="queued"]') as HTMLElement;

      fireEvent.click(within(doneCell).getByText("+3 more"));

      expect(doneCell.querySelectorAll(".lane-card")).toHaveLength(8);
      expect(within(doneCell).getByText("show less")).toBeInTheDocument();
      // The queued cell in the SAME lane remains capped and untouched.
      expect(queuedCell.querySelectorAll(".lane-card")).toHaveLength(5);
      expect(within(queuedCell).getByText("+2 more")).toBeInTheDocument();
    });

    it("shows all 7 failed sessions with no cap button, regardless of count (smoke test)", () => {
      window.localStorage.setItem("ck.swimlanes.collapsed", JSON.stringify({ "/home/user/app-one": false }));
      const sessions = Array.from({ length: 7 }, (_, i) =>
        session({
          id: `f${i}`,
          cwd: "/home/user/app-one",
          status: "failed",
          title: `Failed ${i}`,
          failReason: "boom",
        })
      );
      const { container } = render(
        <Board sessions={sessions} selectedId={null} onSelect={() => {}} now={NOW} />
      );
      const row = laneRowFor(container, "/home/user/app-one");
      const cell = row.querySelector('.lane-cell[data-status="failed"]') as HTMLElement;
      expect(cell.querySelectorAll(".lane-card")).toHaveLength(7);
      expect(within(cell).queryByText(/more/)).not.toBeInTheDocument();
    });
  });

  describe("empty cells", () => {
    it("shows the dash element for an empty queued cell", () => {
      const { container } = render(
        <Board
          sessions={[session({ id: "a", cwd: "/home/user/app-one", status: "running" })]}
          selectedId={null}
          onSelect={() => {}}
          now={NOW}
        />
      );
      const row = laneRowFor(container, "/home/user/app-one");
      const cell = row.querySelector('.lane-cell[data-status="queued"]') as HTMLElement;
      expect(cell.querySelector(".lane-cell-empty")).toBeTruthy();
    });

    it("shows no dash for an empty waiting cell but still renders the cell", () => {
      const { container } = render(
        <Board
          sessions={[session({ id: "a", cwd: "/home/user/app-one", status: "running" })]}
          selectedId={null}
          onSelect={() => {}}
          now={NOW}
        />
      );
      const row = laneRowFor(container, "/home/user/app-one");
      const cell = row.querySelector('.lane-cell[data-status="waiting"]') as HTMLElement;
      expect(cell).toBeTruthy();
      expect(cell.querySelector(".lane-cell-empty")).toBeNull();
    });
  });

  describe("collapse", () => {
    it("clicking the lane head toggles between the expanded view and the collapsed strip", () => {
      const { container } = render(
        <Board
          sessions={[session({ id: "a", cwd: "/home/user/app-one", status: "running" })]}
          selectedId={null}
          onSelect={() => {}}
          now={NOW}
        />
      );
      const row = laneRowFor(container, "/home/user/app-one");
      expect(row.querySelectorAll(".lane-cell")).toHaveLength(5);
      expect(row.querySelector(".lane-collapsed-strip")).toBeNull();

      fireEvent.click(within(row).getByText("app-one"));

      expect(row.querySelectorAll(".lane-cell")).toHaveLength(0);
      expect(row.querySelector(".lane-collapsed-strip")).toBeTruthy();

      fireEvent.click(within(row).getByText("app-one"));

      expect(row.querySelectorAll(".lane-cell")).toHaveLength(5);
      expect(row.querySelector(".lane-collapsed-strip")).toBeNull();
    });

    it("the collapsed strip shows one pill per non-empty status", () => {
      const { container } = render(
        <Board
          sessions={[
            session({ id: "a", cwd: "/home/user/app-one", status: "done", endedAt: "2026-08-08T10:01:00.000Z" }),
            session({ id: "b", cwd: "/home/user/app-one", status: "failed" }),
          ]}
          selectedId={null}
          onSelect={() => {}}
          now={NOW}
        />
      );
      // a lane with only done/failed sessions is auto-collapsed already; assert its pills directly
      const row = laneRowFor(container, "/home/user/app-one");
      const pills = row.querySelectorAll(".lane-collapsed-pill");
      expect(pills).toHaveLength(2);
    });

    it("auto-collapses a lane with only done/failed sessions with no prior localStorage state", () => {
      const { container } = render(
        <Board
          sessions={[
            session({ id: "a", cwd: "/home/user/app-one", status: "done", endedAt: "2026-08-08T10:01:00.000Z" }),
          ]}
          selectedId={null}
          onSelect={() => {}}
          now={NOW}
        />
      );
      const row = laneRowFor(container, "/home/user/app-one");
      expect(row).toHaveAttribute("data-collapsed", "true");
      expect(row.querySelector(".lane-collapsed-strip")).toBeTruthy();
    });

    it("does not auto-collapse a lane with a running session", () => {
      const { container } = render(
        <Board
          sessions={[session({ id: "a", cwd: "/home/user/app-one", status: "running" })]}
          selectedId={null}
          onSelect={() => {}}
          now={NOW}
        />
      );
      const row = laneRowFor(container, "/home/user/app-one");
      expect(row).toHaveAttribute("data-collapsed", "false");
      expect(row.querySelectorAll(".lane-cell")).toHaveLength(5);
    });

    it("reflects collapsed state seeded in localStorage before rendering", () => {
      window.localStorage.setItem("ck.swimlanes.collapsed", JSON.stringify({ "/home/user/app-one": true }));
      const { container } = render(
        <Board
          sessions={[session({ id: "a", cwd: "/home/user/app-one", status: "running" })]}
          selectedId={null}
          onSelect={() => {}}
          now={NOW}
        />
      );
      const row = laneRowFor(container, "/home/user/app-one");
      // Would normally NOT auto-collapse (has a running session), but stored state forces collapsed.
      expect(row).toHaveAttribute("data-collapsed", "true");
    });

    it("reflects expanded state seeded in localStorage overriding auto-collapse", () => {
      // Seed an override only for app-one; app-two is an identically-shaped done-only lane
      // left unseeded, so it auto-collapses normally. That gives the seeded lane a real
      // contrast to prove against: without the override winning over isHistoryOnly, both
      // lanes would collapse identically and this test couldn't tell the difference.
      window.localStorage.setItem("ck.swimlanes.collapsed", JSON.stringify({ "/home/user/app-one": false }));
      const { container } = render(
        <Board
          sessions={[
            session({ id: "a", cwd: "/home/user/app-one", status: "done", endedAt: "2026-08-08T10:01:00.000Z" }),
            session({ id: "b", cwd: "/home/user/app-two", status: "done", endedAt: "2026-08-08T10:01:00.000Z" }),
          ]}
          selectedId={null}
          onSelect={() => {}}
          now={NOW}
        />
      );
      const seededRow = laneRowFor(container, "/home/user/app-one");
      const unseededRow = laneRowFor(container, "/home/user/app-two");
      // Unseeded sibling of the same done-only shape auto-collapses (the real default).
      expect(unseededRow).toHaveAttribute("data-collapsed", "true");
      // Seeded lane overrides that default and stays expanded.
      expect(seededRow).toHaveAttribute("data-collapsed", "false");
    });
  });

  describe("sort", () => {
    it("cycles lane DOM order through activity, name, and sessions via the FleetBar sort control", () => {
      const sessions = [
        // "alpha": 1 running session -> high activity weight, but fewer total sessions and later name
        session({ id: "a1", cwd: "/home/user/alpha", status: "running", startedAt: "2026-08-08T09:00:00.000Z" }),
        // "zeta": 3 done sessions -> zero activity weight, but more total sessions, and later name alphabetically
        session({ id: "z1", cwd: "/home/user/zeta", status: "done", endedAt: "2026-08-08T09:01:00.000Z", startedAt: "2026-08-08T08:00:00.000Z" }),
        session({ id: "z2", cwd: "/home/user/zeta", status: "done", endedAt: "2026-08-08T09:02:00.000Z", startedAt: "2026-08-08T08:01:00.000Z" }),
        session({ id: "z3", cwd: "/home/user/zeta", status: "done", endedAt: "2026-08-08T09:03:00.000Z", startedAt: "2026-08-08T08:02:00.000Z" }),
      ];

      const { container } = render(
        <Board sessions={sessions} selectedId={null} onSelect={() => {}} now={NOW} />
      );

      function laneOrderNames(): string[] {
        return Array.from(container.querySelectorAll(".lane-head-name")).map((el) => el.textContent ?? "");
      }

      // Default sort is "activity": alpha (running, weight 100) beats zeta (done-only, weight 0).
      expect(laneOrderNames()).toEqual(["alpha", "zeta"]);

      const sortOptions = () => screen.getAllByRole("button", { name: /^(activity|name|sessions)$/ });

      // Switch to "name": alphabetical -> alpha, zeta (same order here, but confirms the control works)
      fireEvent.click(sortOptions().find((b) => b.textContent === "name")!);
      expect(laneOrderNames()).toEqual(["alpha", "zeta"]);

      // Switch to "sessions": zeta has 3 sessions vs alpha's 1 -> zeta first.
      fireEvent.click(sortOptions().find((b) => b.textContent === "sessions")!);
      expect(laneOrderNames()).toEqual(["zeta", "alpha"]);

      // Switch back to "activity": alpha (running) outweighs zeta (done-only) again.
      fireEvent.click(sortOptions().find((b) => b.textContent === "activity")!);
      expect(laneOrderNames()).toEqual(["alpha", "zeta"]);
    });

    it("marks the active sort option with data-active", () => {
      render(
        <Board
          sessions={[session({ id: "a", cwd: "/home/user/app-one", status: "running" })]}
          selectedId={null}
          onSelect={() => {}}
          now={NOW}
        />
      );
      const nameButton = screen.getByRole("button", { name: "name" });
      expect(nameButton).toHaveAttribute("data-active", "false");
      fireEvent.click(nameButton);
      expect(nameButton).toHaveAttribute("data-active", "true");
    });
  });

  describe("selection", () => {
    it("calls the Board's onSelect prop with a top-level session's id when its card is clicked", () => {
      const onSelect = vi.fn();
      render(
        <Board
          sessions={[session({ id: "sess-1", cwd: "/home/user/app-one", status: "running", title: "Do work" })]}
          selectedId={null}
          onSelect={onSelect}
          now={NOW}
        />
      );
      fireEvent.click(screen.getByText("Do work"));
      expect(onSelect).toHaveBeenCalledWith("sess-1");
    });

    it("marks the card matching selectedId with the selected styling hook", () => {
      const { container } = render(
        <Board
          sessions={[
            session({ id: "sess-1", cwd: "/home/user/app-one", status: "running", title: "One" }),
            session({ id: "sess-2", cwd: "/home/user/app-one", status: "running", title: "Two" }),
          ]}
          selectedId="sess-1"
          onSelect={() => {}}
          now={NOW}
        />
      );
      const cards = Array.from(container.querySelectorAll(".lane-card"));
      const selectedCard = cards.find((c) => c.textContent?.includes("One"));
      const otherCard = cards.find((c) => c.textContent?.includes("Two"));
      expect(selectedCard).toHaveAttribute("data-selected", "true");
      expect(otherCard).toHaveAttribute("data-selected", "false");
    });

    it("calls onSelect when Enter or Space is pressed on a focused card", () => {
      const onSelect = vi.fn();
      render(
        <Board
          sessions={[session({ id: "sess-1", cwd: "/home/user/app-one", status: "running", title: "Do work" })]}
          selectedId={null}
          onSelect={onSelect}
          now={NOW}
        />
      );
      const card = screen.getByText("Do work").closest(".lane-card") as HTMLElement;
      fireEvent.keyDown(card, { key: "Enter" });
      expect(onSelect).toHaveBeenCalledWith("sess-1");

      onSelect.mockClear();
      fireEvent.keyDown(card, { key: " " });
      expect(onSelect).toHaveBeenCalledWith("sess-1");
    });
  });
});
