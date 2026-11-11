/**
 * Colouring for the Try it code panes: the rail's cURL and live responses.
 * Pure, so the size limit and escaping are unit-tested.
 */

/** Text longer than this, in characters, is shown escaped but not coloured. The
 *  colouring regexes run out of stack in V8 at around 10 MB, and sooner on JSON
 *  full of escapes. */
export const COLOR_LIMIT_CHARS = 1024 * 1024;

export function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** A JSON (or any) response body as HTML, coloured when it's small enough. */
export function colorizeJsonHtml(s: string): string {
  return s ? colorizeJsonText(s) : "(empty response)";
}

/** colorizeJsonHtml without the placeholder for an empty body. */
export function colorizeJsonText(s: string): string {
  if (s.length > COLOR_LIMIT_CHARS) return escHtml(s);
  return escHtml(s).replace(
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (m, str, colon, kw, num) => {
      if (str) return colon ? `<span class="key">${str}</span>${colon}` : `<span class="s">${str}</span>`;
      if (kw) return `<span class="k">${kw}</span>`;
      if (num) return `<span class="n">${num}</span>`;
      return m;
    },
  );
}

/** A cURL command as HTML, coloured when it's small enough. */
export function colorizeCurl(s: string): string {
  const esc = escHtml(s);
  if (s.length > COLOR_LIMIT_CHARS) return esc;
  return esc
    .replace(/^curl/gm, '<span style="color:#6E86FA">curl</span>')
    .replace(/(--[a-z-]+)/g, '<span style="color:#8E959C">$1</span>')
    .replace(/(&#39;|')((?:[^&]|&(?!#39;))*?)(&#39;|')/g, '<span style="color:#3CC88C">$1$2$3</span>');
}
