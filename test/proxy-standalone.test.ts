import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { startStub } from "./proxy-harness";
import { createSite } from "./site-server";

// The standalone server has no content folder, so the proxy's settings have to
// come from the build.

// The build fetches the site's fonts from Google, so it can't run offline.
const online = await fetch("https://fonts.googleapis.com", { signal: AbortSignal.timeout(5000) }).then(
  () => true,
  () => false,
);
const skip = online ? false : "offline: the build needs to reach Google Fonts";

const site = createSite();
const stub = await startStub((_req, res) => res.end("reached"));
const other = await startStub((_req, res) => res.end("other"));
let server: ChildProcess | undefined;
let base = "";

const find = (dir: string): string | undefined => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === "server.js") return full;
    if (entry.isDirectory()) {
      const found = find(full);
      if (found) return found;
    }
  }
  return undefined;
};

before(async () => {
  if (skip) return;
  fs.writeFileSync(path.join(site.dir, "markline.json"), JSON.stringify({ name: "t", api: { baseUrl: `http://127.0.0.1:${stub.port}` } }));
  site.build();
  const entry = find(path.join(site.dir, ".markline", ".next", "standalone"));
  assert.ok(entry, "the build made a standalone server");
  const port = await new Promise<number>((resolve) => {
    const s = net.createServer();
    s.listen(0, () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(p));
    });
  });
  const { MARKLINE_CONTENT: _c, MARKLINE_CONFIG: _f, MARKLINE_DIST: _d, NODE_TEST_CONTEXT: _t, ...env } = process.env;
  server = spawn(process.execPath, [entry], { cwd: path.dirname(entry), stdio: "ignore", env: { ...env, PORT: String(port), HOSTNAME: "127.0.0.1" } });
  base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(base);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error("the standalone server didn't start");
});

after(async () => {
  if (server && server.exitCode === null) {
    const exited = once(server, "exit");
    server.kill("SIGKILL");
    await exited;
  }
  stub.stop();
  other.stop();
  await site.destroy();
});

const post = async (url: string) => {
  const res = await fetch(`${base}/api/playground`, { method: "POST", body: JSON.stringify({ url }) });
  return { status: res.status, data: (await res.json()) as Record<string, unknown> };
};

test("the proxy forwards to the configured API", { skip }, async () => {
  const { status, data } = await post(`http://127.0.0.1:${stub.port}/`);
  assert.equal(status, 200, JSON.stringify(data));
  assert.equal(data.body, "reached");
});

test("it works from the site's own pages behind a proxy that rewrites Host", { skip }, async (t) => {
  // nginx's default: Host becomes the upstream's, and nothing says what it was.
  const { hostname, port } = new URL(base);
  const proxy = await startStub((req, res) => {
    const headers = { ...req.headers, host: `${hostname}:${port}` };
    const upstream = http.request({ hostname, port, path: req.url, method: req.method, headers }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    });
    req.pipe(upstream);
  });
  t.after(() => proxy.stop());
  const site = `http://127.0.0.1:${proxy.port}`;
  const send = async (headers: Record<string, string>) => {
    const res = await fetch(`${site}/api/playground`, { method: "POST", headers, body: JSON.stringify({ url: `http://127.0.0.1:${stub.port}/` }) });
    return { status: res.status, data: (await res.json()) as Record<string, unknown> };
  };
  const same = await send({ origin: site, "sec-fetch-site": "same-origin" });
  assert.equal(same.status, 200, JSON.stringify(same.data));
  assert.equal(same.data.body, "reached");
  assert.equal((await send({ origin: "https://elsewhere.test", "sec-fetch-site": "cross-site" })).status, 403);
});

test("and refuses anything else", { skip }, async () => {
  assert.equal((await post(`http://127.0.0.1:${other.port}/`)).status, 403);
  assert.deepEqual(other.hits, []);
});
