import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FleetBar } from "./FleetBar.js";
import type { SessionStatus } from "../lib/transport/Transport.js";

function counts(overrides: Partial<Record<SessionStatus, number>> = {}): Record<SessionStatus, number> {
  return { queued: 0, running: 0, waiting: 0, done: 0, failed: 0, ...overrides };
}

describe("FleetBar", () => {
  it("renders the wordmark", () => {
    render(<FleetBar counts={counts()} sort="activity" onSortChange={() => {}} />);
    expect(screen.getByText("claudekanban")).toBeInTheDocument();
  });

  it("renders all 5 status counters with their counts", () => {
    render(
      <FleetBar
        counts={counts({ running: 4, waiting: 2, queued: 7, done: 31, failed: 1 })}
        sort="activity"
        onSortChange={() => {}}
      />
    );
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("31")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("renders the 3 sort options", () => {
    render(<FleetBar counts={counts()} sort="activity" onSortChange={() => {}} />);
    expect(screen.getByText("activity")).toBeInTheDocument();
    expect(screen.getByText("name")).toBeInTheDocument();
    expect(screen.getByText("sessions")).toBeInTheDocument();
  });

  it("marks the active sort option with data-active", () => {
    render(<FleetBar counts={counts()} sort="name" onSortChange={() => {}} />);
    expect(screen.getByText("activity")).toHaveAttribute("data-active", "false");
    expect(screen.getByText("name")).toHaveAttribute("data-active", "true");
    expect(screen.getByText("sessions")).toHaveAttribute("data-active", "false");
  });

  it("calls onSortChange with the clicked sort option", () => {
    const onSortChange = vi.fn();
    render(<FleetBar counts={counts()} sort="activity" onSortChange={onSortChange} />);
    fireEvent.click(screen.getByText("sessions"));
    expect(onSortChange).toHaveBeenCalledWith("sessions");
  });

  it("does not render any dead segmented status/project toggle markup", () => {
    const { container } = render(<FleetBar counts={counts()} sort="activity" onSortChange={() => {}} />);
    expect(container.querySelector(".segmented-toggle")).toBeNull();
    expect(screen.queryByText("project")).not.toBeInTheDocument();
  });
});
