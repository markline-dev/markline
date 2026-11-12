import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fetchStat, lastPage, repoOf, statKey } from "../scripts/github-stats-core.mjs";
import { githubApi, MAX_REPOS, STATS_FILE, wantedStats, writeGithubStats } from "../scripts/github-stats.mjs";
import { formatCount, MAX_AGE, newest, refreshStat, shown, type Stat } from "../lib/github-stars";

// GitHub stars: what's fetched, what's shown, and that a failure never shows less.

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 10, 12);

test("a repo comes from a github.com repo URL only", () => {
  assert.equal(repoOf("https://github.com/markline-dev/markline"), "markline-dev/markline");
  assert.equal(repoOf("https://github.com/a/b.git"), "a/b");
  assert.equal(repoOf("https://www.github.com/a/b/tree/main"), "a/b");
  for (const url of ["https://github.com/markline-dev", "https://gitlab.com/a/b", "https://github.com.evil.test/a/b", "not a url", "https://github.com/../x"]) {
    assert.equal(repoOf(url), undefined, url);
  }
  assert.equal(statKey("stars", "a/b"), "stars:a/b");
  assert.equal(statKey("stars", "a/b/c"), undefined);
  for (const name of ["./b", "a/..", "../b", "a/."]) assert.equal(statKey("stars", name), undefined, name);
  assert.equal(statKey("stars", `${"o".repeat(39)}/${"r".repeat(100)}`), `stars:${"o".repeat(39)}/${"r".repeat(100)}`);
  assert.equal(statKey("stars", `${"o".repeat(40)}/r`), undefined, "owner over 39");
  assert.equal(statKey("stars", `o/${"r".repeat(101)}`), undefined, "repo over 100");
  assert.equal(statKey("version", "@markline/markline"), "version:@markline/markline");
});

test("counts are short, and round down", () => {
  const cases: [number, string][] = [[5, "5"], [999, "999"], [1000, "1k"], [1234, "1.2k"], [1999, "1.9k"], [12345, "12k"], [999_999, "999k"], [1_500_000, "1.5M"]];
  for (const [n, s] of cases) assert.equal(formatCount(n), s, String(n));
  assert.equal(shown({ value: 0, fetchedAt: 1 }), undefined, "a 0 isn't shown");
  assert.equal(shown({ value: "0.1.8", fetchedAt: 1 }), "0.1.8");
  assert.equal(shown(undefined), undefined);
});

test("the contributor count comes from the Link header's last page", () => {
  assert.equal(lastPage('<https://api.github.com/x?per_page=1&anon=1&page=2>; rel="next", <https://api.github.com/x?per_page=1&anon=1&page=5>; rel="last"'), 5);
  assert.equal(lastPage(null), undefined);
});

/** A request that never answers, until it's aborted. It holds a timer of its
 *  own, as a real open connection holds the event loop: the abort's timer
 *  doesn't, and Node 22 would otherwise end the test before it fires. */
function hanging(init?: RequestInit): Promise<Response> {
  return new Promise((_, reject) => {
    const keep = setInterval(() => {}, 1000);
    init?.signal?.addEventListener("abort", () => {
      clearInterval(keep);
      reject(init.signal?.reason);
    });
  });
}

/** A fetch that answers from a table, counting calls. */
function fakeFetch(answer: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return answer(url, init);
  }) as unknown as typeof fetch;
  return { f, calls };
}

/** A storage with what's been set, that can be made to throw. */
function fakeStore(initial: Record<string, string> = {}, broken = false) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => {
      if (broken) throw new Error("blocked");
      return data[k] ?? null;
    },
    setItem: (k: string, v: string) => {
      if (broken) throw new Error("blocked");
      data[k] = v;
    },
  };
}

const KEY = "stars:o/r";
const stat = (value: number, ageMs: number): Stat => ({ value, fetchedAt: NOW - ageMs });
const cached = (s: Stat) => ({ [`markline:stat:${KEY}`]: JSON.stringify(s) });

async function shownFor(baked: Stat | undefined, opts: Parameters<typeof refreshStat>[4], mode: "live" | "build" = "live") {
  const seen: (Stat | undefined)[] = [];
  await refreshStat(KEY, baked, mode, (s) => seen.push(s), { now: () => NOW, ...opts });
  return seen;
}

test('"build" never fetches, and shows the build\'s value', async () => {
  const { f, calls } = fakeFetch(() => Response.json({ stargazers_count: 9 }));
  const seen = await shownFor(stat(5, 2 * HOUR), { fetchImpl: f, store: fakeStore() }, "build");
  assert.equal(calls.length, 0);
  assert.deepEqual(seen.map((s) => s?.value), [5]);
});

test("a value under an hour old, from the page or the cache, isn't fetched again", async () => {
  const { f, calls } = fakeFetch(() => Response.json({ stargazers_count: 9 }));
  await shownFor(stat(5, HOUR / 2), { fetchImpl: f, store: fakeStore() });
  await shownFor(stat(5, 2 * HOUR), { fetchImpl: f, store: fakeStore(cached(stat(6, HOUR / 2))) });
  assert.equal(calls.length, 0);
});

test("an older value is shown first, then the fresh one, which is cached", async () => {
  const { f, calls } = fakeFetch(() => Response.json({ stargazers_count: 1234 }));
  const store = fakeStore();
  const seen = await shownFor(stat(5, 2 * HOUR), { fetchImpl: f, store });
  assert.equal(calls.length, 1);
  assert.deepEqual(seen.map((s) => s?.value), [5, 1234]);
  assert.equal(JSON.parse(store.data[`markline:stat:${KEY}`]).value, 1234);
});

test("the newest of the page's and the cache's values is shown", async () => {
  const fail = fakeFetch(() => new Response("", { status: 500 })).f;
  assert.deepEqual((await shownFor(stat(5, 3 * HOUR), { fetchImpl: fail, store: fakeStore(cached(stat(7, 2 * HOUR))) })).map((s) => s?.value), [7]);
  assert.deepEqual((await shownFor(stat(8, 2 * HOUR), { fetchImpl: fail, store: fakeStore(cached(stat(7, 3 * HOUR))) })).map((s) => s?.value), [8]);
});

test("a failed fetch keeps the newest known value: rate limits, errors, timeouts, no storage", async () => {
  const failures: [string, typeof fetch][] = [
    ["403", fakeFetch(() => new Response("{}", { status: 403 })).f],
    ["429", fakeFetch(() => new Response("{}", { status: 429 })).f],
    ["network", fakeFetch(() => Promise.reject(new TypeError("offline"))).f],
    ["bad body", fakeFetch(() => Response.json({ message: "x" })).f],
    ["timeout", fakeFetch((_, init) => hanging(init)).f],
  ];
  for (const [name, f] of failures) {
    const seen = await shownFor(stat(5, 2 * HOUR), { fetchImpl: f, store: fakeStore(cached(stat(6, 3 * HOUR))) });
    assert.deepEqual(seen.map((s) => s?.value), [5], name);
  }
  const blocked = await shownFor(stat(5, 2 * HOUR), { fetchImpl: fakeFetch(() => Response.json({ stargazers_count: 9 })).f, store: fakeStore({}, true) });
  assert.deepEqual(blocked.map((s) => s?.value), [5, 9], "storage that throws doesn't stop it");
  const nothing = await shownFor(undefined, { fetchImpl: failures[0][1], store: fakeStore() });
  assert.deepEqual(nothing, [undefined], "with no value at all there's nothing to show, not a 0");
});

test("a fetch gives up after its timeout", { timeout: 10_000 }, async () => {
  const hang = fakeFetch((_, init) => hanging(init));
  const start = Date.now();
  assert.equal(await fetchStat(KEY, { fetchImpl: hang.f, timeoutMs: 50 }), undefined);
  assert.ok(Date.now() - start < 2000);
});

test("the token goes to the GitHub API only, and the API can be pointed elsewhere", async () => {
  const { f, calls } = fakeFetch((url) => (url.includes("registry.npmjs.org") ? Response.json({ version: "0.1.8" }) : Response.json({ stargazers_count: 3 })));
  await fetchStat("stars:o/r", { fetchImpl: f, token: "t0k", api: "https://ghe.example.com/api/v3" });
  await fetchStat("version:@markline/markline", { fetchImpl: f, token: "t0k" });
  assert.equal(calls[0].url, "https://ghe.example.com/api/v3/repos/o/r");
  assert.equal((calls[0].init?.headers as Record<string, string>).authorization, "Bearer t0k");
  assert.equal(calls[1].url, "https://registry.npmjs.org/@markline/markline/latest");
  assert.equal((calls[1].init?.headers as Record<string, string>).authorization, undefined);
  assert.deepEqual(githubApi({ GITHUB_API_URL: "https://ghe.example.com/api/v3/" }), { url: "https://ghe.example.com/api/v3", bad: false });
  assert.deepEqual(githubApi({}), { url: undefined, bad: false });
  for (const bad of ["file:///etc/passwd", "javascript:alert(1)", "not a url"]) assert.deepEqual(githubApi({ GITHUB_API_URL: bad }), { url: undefined, bad: true }, bad);
});

/** A site folder with markline.json-like config and docs pages. */
function site(t: { after: (fn: () => void) => void }, pages: Record<string, string> = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "markline-stars-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, "docs"));
  for (const [name, body] of Object.entries(pages)) fs.writeFileSync(path.join(dir, "docs", name), body);
  return dir;
}
const topbar = (url: string, extra = {}) => ({ topbar: { links: [{ label: "GitHub", href: url }], ...extra } });

test("the build fetches the topbar repo, repos the pages name, and the home card's numbers", (t) => {
  const dir = site(t, {
    "a.mdx": '<GitHubStars repo="x/one" />\n<GitHubStars repo="not a repo" />',
    "home.mdx": "<MarklineHome />",
  });
  assert.deepEqual(wantedStats(topbar("https://github.com/o/r"), path.join(dir, "docs")).sort(), [
    "contributors:markline-dev/markline", "stars:markline-dev/markline", "stars:o/r", "stars:x/one", "version:@markline/markline",
  ]);
  const many = site(t, { "m.mdx": Array.from({ length: 30 }, (_, i) => `<GitHubStars repo="x/r${i}" />`).join("\n") });
  assert.equal(wantedStats({}, path.join(many, "docs")).length, MAX_REPOS);
});

test("the build writes what it got, keeps the last value it can't refresh, and never fails", async (t) => {
  const dir = site(t);
  const config = topbar("https://github.com/o/r");
  const ok = fakeFetch(() => Response.json({ stargazers_count: 7 }));
  await writeGithubStats({ dir, config, docsDir: path.join(dir, "docs"), fetchImpl: ok.f, now: () => NOW, env: { GITHUB_TOKEN: "secret-token" } });
  const file = path.join(dir, STATS_FILE);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), { "stars:o/r": { value: 7, fetchedAt: NOW } });
  assert.doesNotMatch(fs.readFileSync(file, "utf8"), /secret-token/);

  const down = fakeFetch(() => Promise.reject(new TypeError("offline")));
  await writeGithubStats({ dir, config, docsDir: path.join(dir, "docs"), fetchImpl: down.f, now: () => NOW + 1, env: {} });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), { "stars:o/r": { value: 7, fetchedAt: NOW }, "failed:stars:o/r": NOW + 1 }, "kept, and the failure noted");

  const fresh = site(t);
  await writeGithubStats({ dir: fresh, config, docsDir: path.join(fresh, "docs"), fetchImpl: down.f, now: () => NOW, env: {} });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(fresh, STATS_FILE), "utf8")), { "failed:stars:o/r": NOW }, "no value it didn't get");
});

test("dev doesn't fetch again within the hour, and githubStars: false fetches nothing", async (t) => {
  const dir = site(t);
  const config = topbar("https://github.com/o/r");
  fs.writeFileSync(path.join(dir, STATS_FILE), JSON.stringify({ "stars:o/r": { value: 7, fetchedAt: NOW - HOUR / 2 } }));
  const { f, calls } = fakeFetch(() => Response.json({ stargazers_count: 8 }));
  await writeGithubStats({ dir, config, docsDir: path.join(dir, "docs"), fetchImpl: f, now: () => NOW, maxAgeMs: MAX_AGE, env: {} });
  assert.equal(calls.length, 0);
  await writeGithubStats({ dir, config, docsDir: path.join(dir, "docs"), fetchImpl: f, now: () => NOW + HOUR, maxAgeMs: MAX_AGE, env: {} });
  assert.equal(calls.length, 1, "refetched once it's over an hour old");
  await writeGithubStats({ dir, config: topbar("https://github.com/o/r", { githubStars: false }), docsDir: path.join(dir, "docs"), fetchImpl: f, env: {} });
  assert.equal(calls.length, 1);
});

test("newest picks the latest fetch", () => {
  assert.equal(newest(undefined, stat(1, 3), stat(2, 1), undefined)?.value, 2);
  assert.equal(newest(), undefined);
});

test("a failed fetch isn't tried again for an hour", async () => {
  const { f, calls } = fakeFetch(() => new Response("{}", { status: 429 }));
  const store = fakeStore();
  const at = (now: number) => refreshStat(KEY, undefined, "live", () => {}, { fetchImpl: f, store, now: () => now });
  await at(NOW);
  await at(NOW + HOUR / 2);
  assert.equal(calls.length, 1, "no retry within the hour");
  await at(NOW + HOUR + 1);
  assert.equal(calls.length, 2, "tried again after it");
});

test("values in storage that aren't real counts or versions are ignored", async () => {
  const { f } = fakeFetch(() => new Response("", { status: 500 }));
  for (const bad of [{ value: 1e308, fetchedAt: NOW }, { value: -1, fetchedAt: NOW }, { value: 1.5, fetchedAt: NOW }, { value: "x", fetchedAt: NOW }, { value: 5 }, "junk"]) {
    const store = fakeStore({ [`markline:stat:${KEY}`]: JSON.stringify(bad) });
    const seen = await shownFor(stat(5, 2 * HOUR), { fetchImpl: f, store });
    assert.deepEqual(seen.map((s) => s?.value), [5], JSON.stringify(bad));
  }
  const vkey = "version:@markline/markline";
  const store = fakeStore({ [`markline:stat:${vkey}`]: JSON.stringify({ value: 42, fetchedAt: NOW }) });
  const seen: (Stat | undefined)[] = [];
  await refreshStat(vkey, undefined, "live", (s) => seen.push(s), { fetchImpl: f, store, now: () => NOW });
  assert.deepEqual(seen, [undefined], "a version must be x.y.z");
});

test("a time in the future neither wins nor stops a refresh", async () => {
  const { f, calls } = fakeFetch(() => Response.json({ stargazers_count: 9 }));
  const store = fakeStore(cached({ value: 99, fetchedAt: NOW + 10 * HOUR }));
  const seen = await shownFor(stat(5, 2 * HOUR), { fetchImpl: f, store });
  assert.equal(calls.length, 1);
  assert.deepEqual(seen.map((s) => s?.value), [5, 9]);
});

test("dev doesn't retry what failed within the hour", async (t) => {
  const dir = site(t);
  const config = topbar("https://github.com/o/r");
  const { f, calls } = fakeFetch(() => new Response("{}", { status: 404 }));
  const run = (now: number) => writeGithubStats({ dir, config, docsDir: path.join(dir, "docs"), fetchImpl: f, now: () => now, maxAgeMs: MAX_AGE, env: {} });
  await run(NOW);
  await run(NOW + HOUR / 2);
  assert.equal(calls.length, 1);
  await run(NOW + HOUR + 1);
  assert.equal(calls.length, 2);
  await writeGithubStats({ dir, config, docsDir: path.join(dir, "docs"), fetchImpl: f, now: () => NOW + HOUR + 2, env: {} });
  assert.equal(calls.length, 3, "a build always tries");
});

test("with a GITHUB_API_URL that isn't http(s), the token isn't sent", async (t) => {
  const dir = site(t);
  const { f, calls } = fakeFetch(() => Response.json({ stargazers_count: 7 }));
  await writeGithubStats({ dir, config: topbar("https://github.com/o/r"), docsDir: path.join(dir, "docs"), fetchImpl: f, env: { GITHUB_TOKEN: "enterprise-token", GITHUB_API_URL: "ftp://ghe.example.com" } });
  assert.equal(calls[0].url, "https://api.github.com/repos/o/r");
  assert.equal((calls[0].init?.headers as Record<string, string>).authorization, undefined);
});

test("a site with no docs/ folder yet asks for its topbar repo only", () => {
  assert.deepEqual(wantedStats(topbar("https://github.com/o/r"), path.join(os.tmpdir(), "markline-no-such-docs")), ["stars:o/r"]);
});
