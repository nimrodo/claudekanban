import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Board } from "./Board.js";
import type { SessionDto } from "../lib/transport/Transport.js";

function session(overrides: Partial<SessionDto>): SessionDto {
  return {
    id: "sess-1",
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

describe("Board", () => {
  it("renders a top-level session under its status column", () => {
    render(<Board sessions={[session({ id: "sess-1", status: "running" })]} onSelect={() => {}} />);
    expect(screen.getByRole("heading", { name: "running" })).toBeInTheDocument();
  });

  it("groups a subagent card under its parent, not as a top-level card", () => {
    render(
      <Board
        sessions={[
          session({ id: "parent-1", owner: "main", status: "running" }),
          session({ id: "child-1", owner: "Explore", parentSessionId: "parent-1", status: "done" }),
        ]}
        onSelect={() => {}}
      />
    );
    expect(screen.getByText("Explore")).toBeInTheDocument();
    // Only one top-level card container should exist for the "running" column.
    expect(screen.getAllByText("main")).toHaveLength(1);
  });

  it("shows a subagent's title alongside its owner when present", () => {
    render(
      <Board
        sessions={[
          session({ id: "parent-1", owner: "main", status: "running" }),
          session({ id: "child-1", owner: "Explore", title: "Find TODO occurrences", parentSessionId: "parent-1", status: "done" }),
        ]}
        onSelect={() => {}}
      />
    );
    expect(screen.getByText("Find TODO occurrences")).toBeInTheDocument();
    expect(screen.getByText("Explore")).toBeInTheDocument();
  });

  it("sets data-status on a child card matching its own status", () => {
    const { container } = render(
      <Board
        sessions={[
          session({ id: "parent-1", owner: "main", status: "running" }),
          session({ id: "child-1", owner: "Explore", parentSessionId: "parent-1", status: "running" }),
        ]}
        onSelect={() => {}}
      />
    );
    const childCard = container.querySelector(".child-card");
    expect(childCard?.getAttribute("data-status")).toBe("running");
  });

  it("renders a failed subagent nested under its parent, marked as failed, not as a top-level card", () => {
    const { container } = render(
      <Board
        sessions={[
          session({ id: "parent-1", owner: "main", status: "running" }),
          session({ id: "child-1", owner: "Explore", parentSessionId: "parent-1", status: "failed" }),
        ]}
        onSelect={() => {}}
      />
    );

    const failedColumn = screen.getByRole("heading", { name: "failed" }).closest(".column");
    expect(failedColumn?.querySelector(".card")).toBeNull();

    const childCard = container.querySelector(".child-card");
    expect(childCard?.getAttribute("data-status")).toBe("failed");
    expect(childCard?.textContent).toContain("Explore");
    expect(childCard?.textContent).toContain("failed");
  });

  it("calls onSelect with a top-level session's id when its card is clicked", () => {
    const onSelect = vi.fn();
    render(<Board sessions={[session({ id: "sess-1", status: "running" })]} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("tmp"));
    expect(onSelect).toHaveBeenCalledWith("sess-1");
  });

  it("calls onSelect with a subagent's id (not its parent's) when its child card is clicked", () => {
    const onSelect = vi.fn();
    render(
      <Board
        sessions={[
          session({ id: "parent-1", owner: "main", status: "running" }),
          session({ id: "child-1", owner: "Explore", parentSessionId: "parent-1", status: "done" }),
        ]}
        onSelect={onSelect}
      />
    );
    fireEvent.click(screen.getByText("Explore"));
    expect(onSelect).toHaveBeenCalledWith("child-1");
    expect(onSelect).not.toHaveBeenCalledWith("parent-1");
  });
});
