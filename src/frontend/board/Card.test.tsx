import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Card, handleActivateKey } from "./Card.js";
import type { SessionDto } from "../lib/transport/Transport.js";

function session(overrides: Partial<SessionDto>): SessionDto {
  return {
    id: "sess-1",
    parentSessionId: null,
    owner: "main",
    title: "Do the thing",
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

const NOW = new Date("2026-08-08T10:06:12.000Z").getTime();

describe("Card", () => {
  it("renders a running card with title, activity summary, and elapsed", () => {
    render(
      <Card
        session={session({ status: "running", lastActivitySummary: "Running tests" })}
        children={[]}
        now={NOW}
        selected={false}
        onSelect={() => {}}
      />
    );
    expect(screen.getByText("Do the thing")).toBeInTheDocument();
    expect(screen.getByText("Running tests")).toBeInTheDocument();
    expect(screen.getByText("6m 12s")).toBeInTheDocument();
  });

  it("renders a waiting card with 'blocked {elapsed}' in the footer", () => {
    render(
      <Card
        session={session({ status: "waiting", lastActivitySummary: "Needs approval" })}
        children={[]}
        now={NOW}
        selected={false}
        onSelect={() => {}}
      />
    );
    expect(screen.getByText("blocked 6m 12s")).toBeInTheDocument();
    expect(screen.getAllByText("Needs approval").length).toBeGreaterThan(0);
  });

  it("renders a queued card with queue position and elapsed", () => {
    render(
      <Card
        session={session({ status: "queued" })}
        children={[]}
        now={NOW}
        selected={false}
        onSelect={() => {}}
        queuePosition={3}
      />
    );
    expect(screen.getByText("#3 · queued 6m 12s")).toBeInTheDocument();
  });

  it("renders a done card with duration between startedAt and endedAt", () => {
    render(
      <Card
        session={session({
          status: "done",
          startedAt: "2026-08-08T10:00:00.000Z",
          endedAt: "2026-08-08T10:01:04.000Z",
        })}
        children={[]}
        now={NOW}
        selected={false}
        onSelect={() => {}}
      />
    );
    expect(screen.getByText("1m 4s")).toBeInTheDocument();
  });

  it("falls back to now - startedAt for a done card with a null endedAt", () => {
    render(
      <Card
        session={session({ status: "done", endedAt: null })}
        children={[]}
        now={NOW}
        selected={false}
        onSelect={() => {}}
      />
    );
    expect(screen.getByText("6m 12s")).toBeInTheDocument();
  });

  it("renders a failed card with failReason", () => {
    render(
      <Card
        session={session({ status: "failed", failReason: "Command exited with code 1" })}
        children={[]}
        now={NOW}
        selected={false}
        onSelect={() => {}}
      />
    );
    expect(screen.getByText("Command exited with code 1")).toBeInTheDocument();
  });

  it("falls back to cwd when title is null", () => {
    render(
      <Card
        session={session({ title: null, cwd: "/home/user/app" })}
        children={[]}
        now={NOW}
        selected={false}
        onSelect={() => {}}
      />
    );
    expect(screen.getByText("/home/user/app")).toBeInTheDocument();
  });

  it("sets data-status and data-selected on the card root", () => {
    render(
      <Card
        session={session({ status: "failed" })}
        children={[]}
        now={NOW}
        selected={true}
        onSelect={() => {}}
      />
    );
    const root = screen.getByRole("button", { name: /Do the thing/ });
    expect(root).toHaveAttribute("data-status", "failed");
    expect(root).toHaveAttribute("data-selected", "true");
  });

  it("calls onSelect with the session id when clicked", () => {
    const onSelect = vi.fn();
    render(<Card session={session({})} children={[]} now={NOW} selected={false} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Do the thing/ }));
    expect(onSelect).toHaveBeenCalledWith("sess-1");
  });

  it("calls onSelect on Enter and Space keydown", () => {
    const onSelect = vi.fn();
    render(<Card session={session({})} children={[]} now={NOW} selected={false} onSelect={onSelect} />);
    const root = screen.getByRole("button", { name: /Do the thing/ });
    fireEvent.keyDown(root, { key: "Enter" });
    fireEvent.keyDown(root, { key: " " });
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it("renders subagent chips for a running card with children", () => {
    render(
      <Card
        session={session({ status: "running" })}
        children={[session({ id: "child-1", owner: "explorer", status: "running" })]}
        now={NOW}
        selected={false}
        onSelect={() => {}}
      />
    );
    expect(screen.getByText("explorer")).toBeInTheDocument();
  });
});

describe("handleActivateKey", () => {
  it("calls onActivate for Enter and Space and prevents default", () => {
    const onActivate = vi.fn();
    const preventDefault = vi.fn();
    handleActivateKey({ key: "Enter", preventDefault } as any, onActivate);
    handleActivateKey({ key: " ", preventDefault } as any, onActivate);
    expect(onActivate).toHaveBeenCalledTimes(2);
    expect(preventDefault).toHaveBeenCalledTimes(2);
  });

  it("does nothing for other keys", () => {
    const onActivate = vi.fn();
    handleActivateKey({ key: "Tab", preventDefault: vi.fn() } as any, onActivate);
    expect(onActivate).not.toHaveBeenCalled();
  });
});
