import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
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
  it("renders a status strip with a count per status, including subagents", () => {
    render(
      <Board
        sessions={[
          session({ id: "parent-1", status: "running" }),
          session({ id: "child-1", parentSessionId: "parent-1", status: "failed" }),
        ]}
        onSelect={() => {}}
      />
    );
    const strip = screen.getByRole("group", { name: "Filter by status" });
    expect(within(strip).getByRole("button", { name: /running/ })).toHaveTextContent("1");
    expect(within(strip).getByRole("button", { name: /failed/ })).toHaveTextContent("1");
    expect(within(strip).getByRole("button", { name: /queued/ })).toHaveTextContent("0");
  });

  it("filters visible cards to the clicked status, and shows them again when clicked again", () => {
    render(
      <Board
        sessions={[
          session({ id: "sess-running", status: "running" }),
          session({ id: "sess-failed", status: "failed" }),
        ]}
        onSelect={() => {}}
      />
    );
    const strip = screen.getByRole("group", { name: "Filter by status" });
    const failedButton = within(strip).getByRole("button", { name: /failed/ });

    fireEvent.click(failedButton);
    const failedColumn = screen.getByRole("heading", { name: "failed" }).closest(".column");
    expect(failedColumn?.querySelector(".card")).not.toBeNull();
    const runningColumn = screen.getByRole("heading", { name: "running" }).closest(".column");
    expect(runningColumn?.querySelector(".card")).toBeNull();

    fireEvent.click(failedButton);
    expect(runningColumn?.querySelector(".card")).not.toBeNull();
  });

  it("keeps a top-level card visible under a filter if a nested subagent matches, even though the card's own status does not", () => {
    render(
      <Board
        sessions={[
          session({ id: "parent-1", owner: "main", status: "running" }),
          session({ id: "child-1", owner: "Explore", parentSessionId: "parent-1", status: "failed" }),
        ]}
        onSelect={() => {}}
      />
    );
    const strip = screen.getByRole("group", { name: "Filter by status" });
    fireEvent.click(within(strip).getByRole("button", { name: /failed/ }));

    const runningColumn = screen.getByRole("heading", { name: "running" }).closest(".column");
    expect(runningColumn?.querySelector(".card")).not.toBeNull();
    expect(screen.getByText("Explore")).toBeInTheDocument();
  });

  it("shows a visible/total fraction on the strip for statuses whose sessions are partly hidden by the filter, keeping matched statuses as a plain count", () => {
    render(
      <Board
        sessions={[
          session({ id: "parent-1", owner: "main", status: "running" }),
          session({ id: "child-1", owner: "Explore", parentSessionId: "parent-1", status: "failed" }),
          session({ id: "parent-2", owner: "main", status: "queued" }),
        ]}
        onSelect={() => {}}
      />
    );
    const strip = screen.getByRole("group", { name: "Filter by status" });
    fireEvent.click(within(strip).getByRole("button", { name: /failed/ }));

    expect(within(strip).getByRole("button", { name: /running/ })).toHaveTextContent("running 1");
    expect(within(strip).getByRole("button", { name: /failed/ })).toHaveTextContent("failed 1");
    expect(within(strip).getByRole("button", { name: /queued/ })).toHaveTextContent("queued 0/1");
  });

  it("shows a plain column-badge count when nothing is filtered", () => {
    render(
      <Board
        sessions={[session({ id: "sess-1", status: "running" }), session({ id: "sess-2", status: "running" })]}
        onSelect={() => {}}
      />
    );
    const column = screen.getByRole("heading", { name: "running" }).closest(".column");
    expect(column?.querySelector(".column-count")).toHaveTextContent("2");
  });

  it("shows a visible/total fraction on the column badge once a filter hides some of its cards", () => {
    render(
      <Board
        sessions={[
          session({ id: "sess-running", status: "running" }),
          session({ id: "sess-running-2", status: "running" }),
          session({ id: "sess-failed", status: "failed" }),
        ]}
        onSelect={() => {}}
      />
    );
    const strip = screen.getByRole("group", { name: "Filter by status" });
    fireEvent.click(within(strip).getByRole("button", { name: /failed/ }));

    const runningColumn = screen.getByRole("heading", { name: "running" }).closest(".column");
    expect(runningColumn?.querySelector(".column-count")).toHaveTextContent("0/2");
    const failedColumn = screen.getByRole("heading", { name: "failed" }).closest(".column");
    expect(failedColumn?.querySelector(".column-count")).toHaveTextContent("1");
  });

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
