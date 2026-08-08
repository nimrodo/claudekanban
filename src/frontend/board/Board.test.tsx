import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Board } from "./Board.js";
import type { SessionDto } from "../lib/transport/Transport.js";

function session(overrides: Partial<SessionDto>): SessionDto {
  return {
    id: "sess-1",
    parentSessionId: null,
    owner: "main",
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
    render(<Board sessions={[session({ id: "sess-1", status: "running" })]} />);
    expect(screen.getByRole("heading", { name: "running" })).toBeInTheDocument();
  });

  it("groups a subagent card under its parent, not as a top-level card", () => {
    render(
      <Board
        sessions={[
          session({ id: "parent-1", owner: "main", status: "running" }),
          session({ id: "child-1", owner: "Explore", parentSessionId: "parent-1", status: "done" }),
        ]}
      />
    );
    expect(screen.getByText("Explore")).toBeInTheDocument();
    // Only one top-level card container should exist for the "running" column.
    expect(screen.getAllByText("main")).toHaveLength(1);
  });
});
