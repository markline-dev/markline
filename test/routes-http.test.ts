import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

// The .md and llms.txt routes over HTTP: a real `markline dev` on a small site,
// staged in a temp folder so it leaves the repo alone.

const REPO = path.join(import.meta.dirname, "..");
let root = "";
let server: ChildProcess | undefined;
let base = "";

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const s = net.createServer();
    s.on("error", reject);
    s.listen(0, () => {
      const { port } = s.address() as net.AddressInfo;
      s.close(() => resolve(port));
    });
  });

function write(file: string, text: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

async function waitForServer(url: string) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error("markline dev didn't start");
}

/** A raw path, so fetch's URL parsing can't tidy away a `..`. */
const get = (p: string) => fetch(base + p);

before(async () => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "markline-routes-")));
  const site = path.join(root, "site");
  fs.symlinkSync(path.join(REPO, "node_modules"), (fs.mkdirSync(site), path.join(site, "node_modules")));
  write(path.join(site, "markline.json"), '{"name":"t"}');
  const page = (title: string, body: string) => `---\ntitle: ${title}\n---\n\n${body}\n`;
  write(path.join(site, "docs", "index.mdx"), page("Home", "home text"));
  write(path.join(site, "docs", "guides", "a.mdx"), page("Guide", "{/* a comment */}\n\nguide text"));
  write(path.join(site, "docs", "changelog.mdx"), page("Changelog", "intro only"));
  write(path.join(site, "changelog", "2026-11-05.mdx"), page("One", "entry"));
  write(path.join(site, "private.mdx"), page("Private", "CANARY"));
  write(path.join(root, "outside.mdx"), page("Outside", "CANARY"));
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [path.join(REPO, "bin", "markline.mjs"), "dev"], {
    cwd: site,
    stdio: "ignore",
    env: { ...process.env, PORT: String(port) },
    detached: true,
  });
  await waitForServer(`${base}/api/llms/guides`);
});

after(async () => {
  if (server?.pid) {
    const exited = once(server, "exit");
    try {
      process.kill(-server.pid); // the CLI and the Next it started
      await exited;
    } catch {
      // already gone
    }
  }
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

test("a page's .md is its Markdown, without comments", async () => {
  const res = await get("/guides/a.md");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /text\/markdown/);
  assert.equal(await res.text(), "# Guide\n\nguide text\n");
  assert.equal((await get("/index.md")).status, 200);
});

test("a section's llms.txt lists its pages", async () => {
  const res = await get("/guides/llms.txt");
  assert.equal(res.status, 200);
  assert.match(await res.text(), /\[Guide\]\(\/guides\/a\)/);
});

test("unknown URLs are a 404 that isn't cached", async () => {
  for (const p of ["/nope.md", "/nope/llms.txt", "/api/md/nope", "/api/llms/nope"]) {
    const res = await get(p);
    assert.equal(res.status, 404, p);
    assert.doesNotMatch(res.headers.get("cache-control") ?? "", /s-maxage/, p);
  }
});

test("a changelog with entries has no intro-only .md", async () => {
  assert.equal((await get("/changelog.md")).status, 404);
});

test("no path reaches a file outside docs/", async () => {
  const paths = [
    "/..%2fprivate.md",
    "/%2e%2e%2fprivate.md",
    "/..%2f..%2foutside.md",
    "/guides/..%2f..%2fprivate.md",
    "/..%5cprivate.md",
    "/api/md/..%2fprivate",
    "/api/md/%2e%2e%2fprivate",
    "/api/md/..%2f..%2foutside",
    "/api/md/guides/..%2f..%2fprivate",
  ];
  for (const p of paths) {
    const res = await get(p);
    assert.equal(res.status, 404, p);
    assert.doesNotMatch(await res.text(), /CANARY/, p);
  }
});
