export interface BuildHtmlOptions {
  scriptUris: string[];
  styleUris: string[];
  cspSource: string;
  port: number;
  nonce: string;
}

export function buildHtml(options: BuildHtmlOptions): string {
  const { scriptUris, styleUris, cspSource, port, nonce } = options;
  const baseUrl = `http://localhost:${port}`;

  const styleTags = styleUris.map((uri) => `<link rel="stylesheet" href="${uri}">`).join("\n    ");
  const scriptTags = scriptUris
    .map((uri) => `<script type="module" nonce="${nonce}" src="${uri}"></script>`)
    .join("\n    ");

  const csp = [
    `default-src 'none'`,
    `img-src ${cspSource} data:`,
    `style-src ${cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
    `connect-src ${baseUrl}`,
  ].join("; ");

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    ${styleTags}
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}">
      window.__CLAUDEKANBAN_BASE_URL__ = "${baseUrl}";
    </script>
    ${scriptTags}
  </body>
</html>`;
}
