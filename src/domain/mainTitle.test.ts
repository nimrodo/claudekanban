import { describe, expect, it } from "vitest";
import { deriveMainTitle } from "./mainTitle.js";

describe("deriveMainTitle", () => {
  it("returns the trimmed prompt when it's a single line", () => {
    expect(deriveMainTitle("Fix the login bug in the auth module")).toBe(
      "Fix the login bug in the auth module"
    );
  });

  it("extracts only the first line of a multiline prompt", () => {
    expect(deriveMainTitle("Fix the login bug\n\nHere is more context:\n- it fails on line 42")).toBe(
      "Fix the login bug"
    );
  });

  it("returns null for empty input", () => {
    expect(deriveMainTitle("")).toBeNull();
  });

  it("returns null for whitespace-only input", () => {
    expect(deriveMainTitle("   \n  ")).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(deriveMainTitle(undefined)).toBeNull();
  });

  it("returns a long single-line prompt in full, untruncated", () => {
    const long = "a".repeat(500);
    expect(deriveMainTitle(long)).toBe(long);
  });
});
