import { describe, expect, it } from "vitest";
import { buildHtml } from "./boardPanel.js";

describe("buildHtml", () => {
  it("includes script and link tags for the given asset URIs", () => {
    const html = buildHtml({
      scriptUris: ["https://webview.example/assets/index.js"],
      styleUris: ["https://webview.example/assets/index.css"],
      cspSource: "https://webview.example",
      port: 4321,
    });

    expect(html).toContain('<script type="module" src="https://webview.example/assets/index.js"></script>');
    expect(html).toContain('<link rel="stylesheet" href="https://webview.example/assets/index.css">');
  });

  it("injects the base URL global pointing at the given port", () => {
    const html = buildHtml({
      scriptUris: [],
      styleUris: [],
      cspSource: "https://webview.example",
      port: 4321,
    });

    expect(html).toContain("window.__CLAUDEKANBAN_BASE_URL__ = \"http://localhost:4321\"");
  });

  it("sets a CSP restricting connect-src and script-src to the given cspSource and localhost", () => {
    const html = buildHtml({
      scriptUris: [],
      styleUris: [],
      cspSource: "https://webview.example",
      port: 4321,
    });

    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("https://webview.example");
    expect(html).toContain("http://localhost:4321");
  });
});
