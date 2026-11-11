// Fetches the GitHub stars (and, for Markline's own home page, contributors and
// the npm version) the site shows, into .markline-github.json beside the app,
// so pages have them without the browser asking GitHub: the value a "build"
// site always shows, and a "live" one shows first. Run by the build
// (build-search.mjs) and by `markline dev`. Never fails the build: a number it
// can't get is left as the last one it got, or out.
//
// GITHUB_TOKEN, if set in the shell or CI, raises GitHub's rate limit. It's
// read here only, and sent only to the GitHub API.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fetchStat, HOME_PACKAGE, HOME_REPO, repoOf, statKey, validValue } from "./github-stats-core.mjs";

export const STATS_FILE = ".markline-github.json";

/** At most this many repos named by <GitHubStars repo="…" /> are fetched. */
export const MAX_REPOS = 20;

/** The stats a site shows: its topbar repo's stars, each <GitHubStars repo>'s,
 *  and the home card's when it uses <MarklineHome />. */
export function wantedStats(config, docsDir) {
  const keys = new Set();
  const topbar = (config?.topbar?.links ?? []).find((l) => typeof l?.href === "string" && repoOf(l.href));
  if (topbar) keys.add(statKey("stars", repoOf(topbar.href)));

  const named = new Set();
  let home = false;
  for (const file of mdxFiles(docsDir)) {
    const text = fs.readFileSync(file, "utf8");
    for (const m of text.matchAll(/<GitHubStars\b[^>]*\brepo=["']([^"']+)["']/g)) {
      if (statKey("stars", m[1])) named.add(m[1]);
    }
    if (/<MarklineHome\b/.test(text)) home = true;
  }
  for (const repo of [...named].slice(0, MAX_REPOS)) keys.add(statKey("stars", repo));
  if (home) {
    keys.add(statKey("stars", HOME_REPO));
    keys.add(statKey("contributors", HOME_REPO));
    keys.add(statKey("version", HOME_PACKAGE));
  }
  return [...keys];
}


function mdxFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true, throwIfNoEntry: false }) ?? []) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) mdxFiles(p, out);
    else if (e.isFile() && e.name.endsWith(".mdx")) out.push(p);
  }
  return out;
}

export function readStats(dir) {
  try {
    const stats = JSON.parse(fs.readFileSync(path.join(dir, STATS_FILE), "utf8"));
    return stats && typeof stats === "object" && !Array.isArray(stats) ? stats : {};
  } catch {
    return {};
  }
}

/** GITHUB_API_URL, for GitHub Enterprise or a test: an http(s) URL. `bad` when
 *  it's set to anything else, in which case the token isn't sent anywhere. */
export function githubApi(env = process.env) {
  const v = env.GITHUB_API_URL;
  if (!v) return { url: undefined, bad: false };
  try {
    const u = new URL(v);
    if (u.protocol === "https:" || u.protocol === "http:") return { url: v.replace(/\/+$/, ""), bad: false };
  } catch {}
  return { url: undefined, bad: true };
}

/**
 * Fetch what the site shows into `<dir>/.markline-github.json`. A stat fetched,
 * or tried and failed, less than `maxAgeMs` ago is left alone (0: try
 * everything). Returns what it fetched.
 */
export async function writeGithubStats({ dir = process.cwd(), config, docsDir, maxAgeMs = 0, env = process.env, fetchImpl = fetch, now = Date.now } = {}) {
  if (config?.topbar?.githubStars === false) return [];
  const old = readStats(dir);
  const keys = wantedStats(config, docsDir);
  const recent = (t) => maxAgeMs > 0 && Number.isFinite(t) && t <= now() && t > now() - maxAgeMs;
  const stale = keys.filter((k) => !recent(old[k]?.fetchedAt) && !recent(old[`failed:${k}`]));
  if (stale.length === 0) return [];

  const api = githubApi(env);
  if (api.bad) console.warn("[markline] GITHUB_API_URL must be an http(s) URL; using api.github.com, without GITHUB_TOKEN.");
  const opts = { api: api.url, token: api.bad ? undefined : env.GITHUB_TOKEN || undefined, fetchImpl, now };
  const got = await Promise.all(stale.map((k) => fetchStat(k, opts)));
  const next = {};
  for (const k of keys) {
    if (validValue(k, old[k]?.value)) next[k] = old[k];
    if (Number.isFinite(old[`failed:${k}`])) next[`failed:${k}`] = old[`failed:${k}`];
  }
  const kept = [], missing = [];
  stale.forEach((k, i) => {
    if (got[i]) {
      next[k] = got[i];
      delete next[`failed:${k}`];
    } else {
      next[`failed:${k}`] = now();
      (next[k] ? kept : missing).push(k);
    }
  });
  fs.writeFileSync(path.join(dir, STATS_FILE), JSON.stringify(next));
  if (kept.length) console.warn(`[markline] couldn't fetch ${kept.join(", ")}; keeping the last value${kept.length > 1 ? "s" : ""}.`);
  if (missing.length) console.warn(`[markline] couldn't fetch ${missing.join(", ")}; showing no count.`);
  return stale.filter((_, i) => got[i]);
}

// `markline dev` runs this file before Next starts, keeping what's under an hour old.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const content = process.env.MARKLINE_CONTENT;
  const root = content ? path.resolve(content) : process.cwd();
  const configPath = process.env.MARKLINE_CONFIG ? path.resolve(process.env.MARKLINE_CONFIG) : path.join(root, "markline.json");
  let config = {};
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {}
  await writeGithubStats({ config, docsDir: path.join(root, "docs"), maxAgeMs: 60 * 60 * 1000 }).catch(() => {});
}
