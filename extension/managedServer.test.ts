import { describe, expect, it } from "vitest";
import { getFreePort } from "./managedServer.js";

describe("getFreePort", () => {
  it("returns a valid port number", async () => {
    const port = await getFreePort();
    expect(port).toBeGreaterThan(0);
    expect(port).toBeLessThanOrEqual(65535);
  });

  it("returns different ports across calls", async () => {
    const portA = await getFreePort();
    const portB = await getFreePort();
    expect(portA).not.toBe(portB);
  });
});
