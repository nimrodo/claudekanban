import { describe, expect, it } from "vitest";
import { formatElapsed } from "./formatElapsed.js";

describe("formatElapsed", () => {
  describe("seconds only (under 60 seconds)", () => {
    it("formats 0ms as 0s", () => {
      expect(formatElapsed(0)).toBe("0s");
    });

    it("formats sub-second values as 0s", () => {
      expect(formatElapsed(500)).toBe("0s");
    });

    it("formats 1 second", () => {
      expect(formatElapsed(1000)).toBe("1s");
    });

    it("formats 12 seconds", () => {
      expect(formatElapsed(12000)).toBe("12s");
    });

    it("formats 59 seconds", () => {
      expect(formatElapsed(59000)).toBe("59s");
    });
  });

  describe("minutes + seconds (60 seconds to 3599 seconds)", () => {
    it("formats 60 seconds as 1m 0s", () => {
      expect(formatElapsed(60000)).toBe("1m 0s");
    });

    it("formats 6 minutes 12 seconds", () => {
      expect(formatElapsed(372000)).toBe("6m 12s");
    });

    it("formats 1 minute 30 seconds", () => {
      expect(formatElapsed(90000)).toBe("1m 30s");
    });

    it("formats 59 minutes 59 seconds", () => {
      expect(formatElapsed(3599000)).toBe("59m 59s");
    });
  });

  describe("hours + minutes (3600 seconds or more)", () => {
    it("formats 1 hour as 1h 0m", () => {
      expect(formatElapsed(3600000)).toBe("1h 0m");
    });

    it("formats 1 hour 4 minutes", () => {
      expect(formatElapsed(3840000)).toBe("1h 4m");
    });

    it("formats 2 hours 30 minutes, discarding seconds", () => {
      expect(formatElapsed(9030000)).toBe("2h 30m");
    });

    it("formats 10 hours 1 minute", () => {
      expect(formatElapsed(36060000)).toBe("10h 1m");
    });

    it("formats a very large value: 24 hours", () => {
      expect(formatElapsed(86400000)).toBe("24h 0m");
    });

    it("formats 100 hours 45 minutes", () => {
      expect(formatElapsed(362700000)).toBe("100h 45m");
    });
  });
});
