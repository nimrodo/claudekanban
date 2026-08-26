import { describe, expect, it } from "vitest";
import { createServer } from "node:net";
import { resolveActualPort } from "./resolveActualPort.js";

describe("resolveActualPort", () => {
  it("returns the OS-assigned port for a server listening on port 0", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));

    const port = resolveActualPort(server);

    expect(port).toBeGreaterThan(0);
    server.close();
  });
});
