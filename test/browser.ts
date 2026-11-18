import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Headless Chrome over the DevTools protocol, for the browser tests. Tests
// skip where no Chrome is installed (set CHROME_PATH to point at one).

function findChrome(): string | undefined {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  for (const c of candidates) if (c && fs.existsSync(c)) return c;
  for (const name of ["google-chrome", "chromium"]) {
    const r = spawnSync("which", [name], { encoding: "utf8" });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  }
  return undefined;
}

export const chromePath = findChrome();
/** A test's `skip`: false, or why a browser test can't run here. */
export const browserSkip: string | false =
  process.platform === "win32" ? "builds are slow on Windows CI" : !chromePath ? "no Chrome found (set CHROME_PATH)" : false;

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type Send = (method: string, params?: object) => Promise<{ result?: { result?: { value?: unknown }; data?: string } }>;

/**
 * Start headless Chrome and return its first page's DevTools socket URL.
 * Chrome picks a free port and prints it; if it exits or says nothing in time,
 * the failure carries what it wrote to stderr.
 */
async function launchChrome(profile: string): Promise<{ chrome: ChildProcess; ws: string }> {
  const args = ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check"];
  // Linux CI runners (Ubuntu 24.04 restricts unprivileged user namespaces) and
  // containers can't start Chrome's sandbox; this Chrome only loads the test site.
  if (process.platform === "linux") args.push("--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu");
  const chrome = spawn(chromePath!, [...args, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  const browserWs = await new Promise<string>((resolve, reject) => {
    const fail = (why: string) => reject(new Error(`Chrome's DevTools endpoint: ${why}\n${chromePath} ${args.join(" ")}\nstderr:\n${stderr.slice(-4000) || "(nothing)"}`));
    const timer = setTimeout(() => fail("no DevTools URL after 30s"), 30_000);
    chrome.on("error", (e) => (clearTimeout(timer), fail(String(e))));
    chrome.on("exit", (code, signal) => (clearTimeout(timer), fail(`Chrome exited (${signal ?? code})`)));
    chrome.stderr!.on("data", (d) => {
      stderr += d;
      const m = stderr.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) (clearTimeout(timer), resolve(m[1]));
    });
  });
  chrome.removeAllListeners("exit");
  chrome.stderr!.resume(); // keep draining it
  const port = new URL(browserWs).port;
  for (let i = 0; i < 100; i++) {
    try {
      const targets = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
      const page = targets.find((t) => t.type === "page")?.webSocketDebuggerUrl;
      if (page) return { chrome, ws: page };
    } catch {}
    await sleep(100);
  }
  throw new Error(`Chrome's DevTools endpoint: no page target on port ${port}\nstderr:\n${stderr.slice(-4000)}`);
}

/** A page in headless Chrome: `send` a DevTools command, `ev`aluate an expression, `close` it all. */
export async function openBrowser() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "markline-chrome-"));
  const { chrome, ws } = await launchChrome(profile);
  const sock = new WebSocket(ws);
  await new Promise((r) => sock.addEventListener("open", r, { once: true }));
  let id = 0;
  const pending = new Map<number, (v: unknown) => void>();
  sock.addEventListener("message", (m) => {
    const d = JSON.parse(String(m.data));
    if (d.id && pending.has(d.id)) {
      pending.get(d.id)!(d);
      pending.delete(d.id);
    }
  });
  const send: Send = (method, params = {}) =>
    new Promise((r) => {
      const i = ++id;
      pending.set(i, r as (v: unknown) => void);
      sock.send(JSON.stringify({ id: i, method, params }));
    });
  const ev = async <T,>(expr: string): Promise<T> =>
    (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value as T;
  await send("Page.enable");
  const close = () => {
    chrome.kill();
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch {} // Chrome may still be writing as it exits
  };
  return { send, ev, close };
}
