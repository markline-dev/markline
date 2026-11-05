import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

// A small docs site in a temp folder, served by the real CLI, for tests of the
// routes over HTTP. Staged there, it leaves the repo's own files alone.

const REPO = path.join(import.meta.dirname, "..");
const CLI = path.join(REPO, "bin", "markline.mjs");

/** The env without the test runner's own marker, which Next's workers inherit. */
function cliEnv(extra: Record<string, string> = {}) {
  const { NODE_TEST_CONTEXT: _, ...env } = process.env;
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
  write(path.join(dir, "private.mdx"), page("Private", "CANARY"));
  write(path.join(root, "outside.mdx"), page("Outside", "CANARY"));

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
    async destroy() {
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
