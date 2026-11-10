// GitHub stars, contributors and an npm package's version: what to fetch and
// how. Shared by the build (scripts/github-stats.mjs), which bakes the numbers
// into pages, and the browser (lib/github-stars.ts), which refreshes them. Plain
// fetch only, so it runs in both. Never given a token in the browser.

/** What Markline's own home card (<MarklineHome />) shows. */
export const HOME_REPO = "markline-dev/markline";
export const HOME_PACKAGE = "@markline/markline";

/** "owner/repo", from a github.com repo URL; undefined for a user, an org or
 *  anything else. */
export function repoOf(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return undefined;
  }
  if (!/^(www\.)?github\.com$/i.test(u.hostname)) return undefined;
  const [owner, repo] = u.pathname.split("/").filter(Boolean);
  const name = repo?.replace(/\.git$/, "");
  return owner && name && isRepo(`${owner}/${name}`) ? `${owner}/${name}` : undefined;
}

/** A plain "owner/repo". */
export const isRepo = (s) => typeof s === "string" && /^[\w.-]+\/[\w.-]+$/.test(s) && !s.split("/").some((p) => p === "." || p === "..");

/** An npm package name, scoped or not. */
const isPackage = (s) => typeof s === "string" && /^(@[\w.-]+\/)?[\w.-]+$/.test(s);

/** A stat's key: "stars:owner/repo", "contributors:owner/repo" or
 *  "version:package". Undefined when the name isn't one. */
export function statKey(kind, name) {
  if ((kind === "stars" || kind === "contributors") && isRepo(name)) return `${kind}:${name}`;
  if (kind === "version" && isPackage(name)) return `version:${name}`;
  return undefined;
}

/** The last page number in a GitHub Link header: with per_page=1, a count. */
export function lastPage(link) {
  const m = /[?&]page=(\d+)[^>]*>;\s*rel="last"/.exec(link ?? "");
  return m ? Number(m[1]) : undefined;
}

const GITHUB = "https://api.github.com";
const NPM = "https://registry.npmjs.org";

/**
 * Fetch one stat: { value, fetchedAt }, or undefined when it can't be had
 * (offline, rate-limited, not found, too slow). Never throws. `api` and `token`
 * are for the build only.
 */
export async function fetchStat(key, { api = GITHUB, token, timeoutMs = 5000, fetchImpl = fetch, now = Date.now } = {}) {
  const [kind, name] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
  if (statKey(kind, name) !== key) return undefined;
  const headers = { accept: kind === "version" ? "application/json" : "application/vnd.github+json" };
  if (token && kind !== "version") headers.authorization = `Bearer ${token}`;
  const url =
    kind === "stars" ? `${api}/repos/${name}`
    : kind === "contributors" ? `${api}/repos/${name}/contributors?per_page=1&anon=1`
    : `${NPM}/${name}/latest`;
  try {
    const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return undefined;
    const body = await res.json();
    const value =
      kind === "stars" ? body?.stargazers_count
      : kind === "contributors" ? (lastPage(res.headers.get("link")) ?? (Array.isArray(body) ? body.length : undefined))
      : body?.version;
    const ok = kind === "version" ? typeof value === "string" && value.length > 0 && value.length < 64 : Number.isInteger(value) && value >= 0;
    return ok ? { value, fetchedAt: now() } : undefined;
  } catch {
    return undefined;
  }
}
