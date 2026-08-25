import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SubagentChips } from "./SubagentChips.js";
import type { SessionDto } from "../lib/transport/Transport.js";

function session(overrides: Partial<SessionDto>): SessionDto {
  return {
    id: "child-1",
    parentSessionId: "parent-1",
    owner: "explorer",
    title: null,
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

describe("SubagentChips", () => {
  it("returns null (renders nothing) when there are no children", () => {
    const { container } = render(<SubagentChips children={[]} onSelect={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders one chip per child up to the default max of 3", () => {
    const children = [
      session({ id: "c1", owner: "explorer" }),
      session({ id: "c2", owner: "builder" }),
      session({ id: "c3", owner: "reviewer" }),
    ];
    render(<SubagentChips children={children} onSelect={() => {}} />);
    expect(screen.getByText("explorer")).toBeInTheDocument();
    expect(screen.getByText("builder")).toBeInTheDocument();
    expect(screen.getByText("reviewer")).toBeInTheDocument();
    expect(screen.queryByText(/more/)).not.toBeInTheDocument();
  });

  it("caps at max and renders a +N more indicator", () => {
    const children = [
      session({ id: "c1", owner: "a" }),
      session({ id: "c2", owner: "b" }),
      session({ id: "c3", owner: "c" }),
      session({ id: "c4", owner: "d" }),
      session({ id: "c5", owner: "e" }),
    ];
    render(<SubagentChips children={children} onSelect={() => {}} />);
    expect(screen.getByText("a")).toBeInTheDocument();
    expect(screen.getByText("b")).toBeInTheDocument();
    expect(screen.getByText("c")).toBeInTheDocument();
    expect(screen.queryByText("d")).not.toBeInTheDocument();
    expect(screen.getByText("+2 more")).toBeInTheDocument();
  });

  it("respects a custom max", () => {
    const children = [session({ id: "c1", owner: "a" }), session({ id: "c2", owner: "b" })];
    render(<SubagentChips children={children} onSelect={() => {}} max={1} />);
    expect(screen.getByText("a")).toBeInTheDocument();
    expect(screen.queryByText("b")).not.toBeInTheDocument();
    expect(screen.getByText("+1 more")).toBeInTheDocument();
  });

  it("the +N more indicator has no click role", () => {
    const children = Array.from({ length: 4 }, (_, i) => session({ id: `c${i}`, owner: `o${i}` }));
    render(<SubagentChips children={children} onSelect={() => {}} />);
    const overflow = screen.getByText("+1 more");
    expect(overflow).not.toHaveAttribute("role", "button");
    expect(overflow).not.toHaveAttribute("tabIndex");
  });

  it("calls onSelect with the child id and stops propagation when a chip is clicked", () => {
    const onSelect = vi.fn();
    const parentClick = vi.fn();
    render(
      <div onClick={parentClick}>
        <SubagentChips children={[session({ id: "child-9", owner: "explorer" })]} onSelect={onSelect} />
      </div>
    );
    fireEvent.click(screen.getByText("explorer"));
    expect(onSelect).toHaveBeenCalledWith("child-9");
    expect(parentClick).not.toHaveBeenCalled();
  });

  it("supports keyboard activation via Enter", () => {
    const onSelect = vi.fn();
    render(<SubagentChips children={[session({ id: "child-9", owner: "explorer" })]} onSelect={onSelect} />);
    fireEvent.keyDown(screen.getByText("explorer").closest('[role="button"]')!, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("child-9");
  });

  it("sets data-status on each chip from the child's status", () => {
    render(<SubagentChips children={[session({ id: "child-9", owner: "explorer", status: "failed" })]} onSelect={() => {}} />);
    const chip = screen.getByText("explorer").closest(".subagent-chip");
    expect(chip).toHaveAttribute("data-status", "failed");
  });
});
