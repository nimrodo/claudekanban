import { describe, expect, it, vi } from "vitest";
import { allowAllOrigins } from "./corsMiddleware.js";

describe("allowAllOrigins", () => {
  it("sets Access-Control-Allow-Origin to * and calls next", () => {
    const setHeader = vi.fn();
    const req = {} as Parameters<typeof allowAllOrigins>[0];
    const res = { setHeader } as unknown as Parameters<typeof allowAllOrigins>[1];
    const next = vi.fn();

    allowAllOrigins(req, res, next);

    expect(setHeader).toHaveBeenCalledWith("Access-Control-Allow-Origin", "*");
    expect(next).toHaveBeenCalledOnce();
  });
});
