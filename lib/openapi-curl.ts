/**
 * Quoting for generated cURL commands, shared by the code rail, the
 * per-operation page and the Try it panes. People paste these into a shell, and
 * the values come from the spec or the reader, so nothing here may expand or
 * run: everything is a literal word except an explicit `$API_KEY`.
 * Pure (no `@/` or Node imports) so the client playground can use it too.
 */

/** Quote a shell word only when it needs it (POSIX single quotes). */
export function shellWord(s: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, "'\\''")}'`;
}

/** A `Name: value` header argument. Double quotes when plainly safe, as people write them. */
export function headerWord(name: string, value: string): string {
  const line = `${name}: ${value}`;
  return /^[A-Za-z0-9 _:;,./=+-]+$/.test(line) ? `"${line}"` : shellWord(line);
}

/** An API-key header argument, where only `$API_KEY` expands. */
export function apiKeyWord(name: string): string {
  if (/^[A-Za-z0-9_-]+$/.test(name)) return `"${name}: $API_KEY"`;
  return `${shellWord(`${name}: `)}"$API_KEY"`;
}

/** The sample URL, with path and query values encoded so they stay one argument. */
export function sampleUrl(
  base: string,
  path: string,
  pathValue: (name: string) => unknown,
  query: { name: string; value: unknown }[] = [],
): string {
  const filled = path.replace(/\{([^}]+)\}/g, (_, name: string) => encodeURIComponent(String(pathValue(name) ?? `:${name}`)));
  const qs = query.map((q) => `${encodeURIComponent(q.name)}=${encodeURIComponent(String(q.value))}`).join("&");
  return `${base}${filled}${qs ? `?${qs}` : ""}`;
}

/** A form/multipart field value as text: JSON for structured values. */
export function formText(v: unknown): string {
  return v !== null && typeof v === "object" ? JSON.stringify(v) : String(v);
}

export type CurlFlag = "form" | "form-string" | "data-urlencode" | "data-raw";

/**
 * One `multipart/form-data` file: `-F name=@path`. curl reads `;` and `,` in a
 * path as options, so a path carrying them is double-quoted inside the value.
 */
export function formFileArg(name: string, path: string): { flag: CurlFlag; word: string } {
  const safe = /[;,"\\]/.test(path) ? `"${path.replace(/(["\\])/g, "\\$1")}"` : path;
  return { flag: "form", word: shellWord(`${name}=@${safe}`) };
}

/**
 * One text field of a form body. `-F` would read `@file` and `<file` as uploads
 * and `;type=` as options, and `--data-urlencode` reads `name@file` as a file,
 * so these flags keep a sample value from ever touching the reader's disk.
 */
export function formFieldArg(kind: "multipart" | "form", name: string, value: unknown): { flag: CurlFlag; word: string } {
  const text = formText(value);
  if (kind === "multipart") return { flag: "form-string", word: shellWord(`${name}=${text}`) };
  if (name.includes("@")) return { flag: "data-raw", word: shellWord(`${encodeURIComponent(name)}=${encodeURIComponent(text)}`) };
  return { flag: "data-urlencode", word: shellWord(`${name}=${text}`) };
}
