import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

// A small docs site in a temp folder, served by the real CLI, for tests of the
// routes over HTTP. Staged there, it leaves the repo's own files alone.

const REPO = path.join(import.meta.dirname, "..");
const CLI = path.join(REPO, "bin", "markline.mjs");

/** The env without the test runner's own marker, which Next's workers inherit,
 *  or an output folder set for the repo's own builds. */
function cliEnv(extra: Record<string, string> = {}) {
  const { NODE_TEST_CONTEXT: _, MARKLINE_DIST: __, ...env } = process.env;
  return { ...env, ...extra };
}

function write(file: string, text: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const s = net.createServer();
    s.on("error", reject);
    s.listen(0, () => {
      const { port } = s.address() as net.AddressInfo;
      s.close(() => resolve(port));
    });
  });

/** The CLI and the Next it started, which is its own process group. */
function stopGroup(server: ChildProcess, signal: NodeJS.Signals = "SIGTERM") {
  try {
    if (server.pid) process.kill(-server.pid, signal);
  } catch {
    // already gone
  }
}

// Interrupting the test run shouldn't leave servers behind.
const running = new Set<ChildProcess>();
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    for (const server of running) stopGroup(server, "SIGKILL");
    process.exit(1);
  });
}

export function createSite() {
  // Inside the repo: Next's standalone tracing can't span the OS temp folder and
  // the node_modules it links to.
  const tmp = path.join(REPO, ".test-tmp");
  fs.mkdirSync(tmp, { recursive: true });
  const root = fs.mkdtempSync(path.join(tmp, "routes-"));
  const dir = path.join(root, "site");
  fs.mkdirSync(dir);
  fs.symlinkSync(path.join(REPO, "node_modules"), path.join(dir, "node_modules"));
  write(path.join(dir, "markline.json"), '{"name":"t"}');
  const page = (title: string, body: string) => `---\ntitle: ${title}\n---\n\n${body}\n`;
  write(path.join(dir, "docs", "index.mdx"), page("Home", "home text"));
  write(path.join(dir, "docs", "guides", "a.mdx"), page("Guide", "{/* a comment */}\n\nguide text"));
  write(path.join(dir, "docs", "changelog.mdx"), page("Changelog", "intro only"));
  write(path.join(dir, "changelog", "2026-11-05.mdx"), page("One", "entry"));

  let server: ChildProcess | undefined;
  return {
    dir,
    build() {
      const r = spawnSync(process.execPath, [CLI, "build"], { cwd: dir, encoding: "utf8", env: cliEnv() });
      if (r.status !== 0) throw new Error(`markline build failed (${r.status}, ${r.signal}):\n${r.stdout}\n${r.stderr}`);
    },
    /** Starts `markline <command>` and returns its base URL once it answers. */
    async serve(command: "dev" | "start", probe: string) {
      const port = await freePort();
      server = spawn(process.execPath, [CLI, command], {
        cwd: dir,
        stdio: "ignore",
        detached: true,
        env: cliEnv({ PORT: String(port) }),
      });
      running.add(server);
      const base = `http://127.0.0.1:${port}`;
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        try {
          await fetch(base + probe);
          return base;
        } catch {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
      throw new Error(`markline ${command} didn't start`);
    },
    export() {
      const r = spawnSync(process.execPath, [CLI, "export"], { cwd: dir, encoding: "utf8", env: cliEnv() });
      if (r.status !== 0) throw new Error(`markline export failed (${r.status}, ${r.signal}):\n${r.stdout}\n${r.stderr}`);
    },
    async destroy() {
      if (server?.pid) {
        stopGroup(server);
        // It may have exited already, or a worker may hold on past it.
        if (server.exitCode === null && server.signalCode === null) {
          await Promise.race([once(server, "exit"), new Promise((r) => setTimeout(r, 10_000))]);
        }
        stopGroup(server, "SIGKILL"); // any worker still writing
        running.delete(server);
      }
      for (let tries = 0; ; tries++) {
        try {
          fs.rmSync(root, { recursive: true, force: true });
          return;
        } catch (err) {
          if (tries === 50) throw err;
          await new Promise((r) => setTimeout(r, 200));
        }
      }
    },
  };
}

/** Every file under `dir`, for spotting what a request wrote. */
export function filesUnder(dir: string): string[] {
  return (fs.readdirSync(dir, { recursive: true, withFileTypes: true }) as fs.Dirent[])
    .filter((e) => e.isFile())
    .map((e) => path.join(e.parentPath, e.name))
    .sort();
}
