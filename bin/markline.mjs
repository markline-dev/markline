#!/usr/bin/env node
// Markline CLI — run a docs site from the consumer's own markline.json + content
// without forking the framework. The Next app ships inside this package; the
// CLI launches it pointed at the current working directory's content.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(__dirname, ".."); // the Next app (this package root)
const CONTENT_DIR = process.cwd(); // the consumer's project
// Prefer a branded markline.json, fall back to docs.json (Mintlify-compatible).
const CONFIG_PATH = fs.existsSync(path.join(CONTENT_DIR, "markline.json"))
  ? path.join(CONTENT_DIR, "markline.json")
  : path.join(CONTENT_DIR, "docs.json");

// Next won't compile an app that lives inside node_modules, so we copy the app
// into a working dir in the consumer's project and run Next from there.
const WORK_DIR = path.join(CONTENT_DIR, ".markline");
const SEARCH_SCRIPT = path.join(WORK_DIR, "scripts", "build-search.mjs");
const TEMPLATE_DIR = path.join(APP_DIR, "templates", "init");

// App source to stage into WORK_DIR (everything Next needs except node_modules).
const APP_FILES = [
  "app", "components", "lib", "scripts",
  "next.config.mjs", "tailwind.config.ts", "postcss.config.mjs",
  "tsconfig.json", "next-env.d.ts", "package.json",
];

// Resolve Next's CLI entry via Node module resolution rather than a fixed
// node_modules/.bin path: when @markline/markline is installed as a dependency,
// npm hoists `next` to the consumer's top-level node_modules, not under our
// package. Resolving from APP_DIR walks up to wherever `next` actually lives.
function resolveNextBin() {
  const req = createRequire(path.join(APP_DIR, "package.json"));
  const nextPkg = req.resolve("next/package.json");
  return path.join(path.dirname(nextPkg), "dist", "bin", "next");
}

/**
 * Stage the app into WORK_DIR (real files outside node_modules so Next compiles
 * them) and point its node_modules at the consumer's installed dependencies.
 */
function syncApp() {
  fs.mkdirSync(WORK_DIR, { recursive: true });
  for (const name of APP_FILES) {
    const src = path.join(APP_DIR, name);
    if (!fs.existsSync(src)) continue;
    const dest = path.join(WORK_DIR, name);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(src, dest, { recursive: true });
  }
  // Serve the consumer's own static assets (logo, favicon, images) from /public.
  const pub = path.join(CONTENT_DIR, "public");
  if (fs.existsSync(pub)) {
    fs.cpSync(pub, path.join(WORK_DIR, "public"), { recursive: true });
  }

  const nm = path.join(WORK_DIR, "node_modules");
  const deps = path.join(CONTENT_DIR, "node_modules");
  if (!fs.existsSync(nm) && fs.existsSync(deps)) {
    fs.symlinkSync(deps, nm, "junction");
  }
}

function readPkgVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(APP_DIR, "package.json"), "utf8")).version;
  } catch {
    return "0.0.0";
  }
}

function baseEnv(extra = {}) {
  return {
    ...process.env,
    MARKLINE_CONTENT: CONTENT_DIR,
    MARKLINE_CONFIG: CONFIG_PATH,
    ...extra,
  };
}

function run(cmd, args, { env = baseEnv(), cwd = APP_DIR } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${path.basename(cmd)} exited with code ${code}`))));
  });
}

/** Run the Next CLI via `node <next-bin>` from the staged WORK_DIR. */
function runNext(args, opts = {}) {
  return run(process.execPath, [resolveNextBin(), ...args], { cwd: WORK_DIR, ...opts });
}

function requireConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(
      `\n  No markline.json (or docs.json) found in ${CONTENT_DIR}.\n  Run \`markline init\` to scaffold a new docs project here.\n`,
    );
    process.exit(1);
  }
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

async function buildSearch(env) {
  await run(process.execPath, [SEARCH_SCRIPT], { env, cwd: WORK_DIR });
}

const COMMANDS = {
  async init(args) {
    const target = args[0] ? path.resolve(CONTENT_DIR, args[0]) : CONTENT_DIR;
    if (!fs.existsSync(TEMPLATE_DIR)) {
      console.error(`  Template directory missing: ${TEMPLATE_DIR}`);
      process.exit(1);
    }
    if (fs.existsSync(path.join(target, "markline.json")) || fs.existsSync(path.join(target, "docs.json"))) {
      console.error(`  A markline.json/docs.json already exists in ${target} — refusing to overwrite.`);
      process.exit(1);
    }
    copyDir(TEMPLATE_DIR, target);
    const rel = path.relative(CONTENT_DIR, target) || ".";
    console.log(`\n  Created a Markline docs project in ${rel}\n`);
    console.log(`  Next steps:`);
    if (rel !== ".") console.log(`    cd ${rel}`);
    console.log(`    markline dev\n`);
  },

  async dev() {
    requireConfig();
    syncApp();
    await runNext(["dev"], { env: baseEnv() });
  },

  async build() {
    requireConfig();
    syncApp();
    const env = baseEnv();
    await buildSearch(env);
    await runNext(["build"], { env });
  },

  async start() {
    requireConfig();
    syncApp();
    await runNext(["start"], { env: baseEnv() });
  },

  async export() {
    requireConfig();
    syncApp();
    const env = baseEnv({ MARKLINE_EXPORT: "1" });
    await buildSearch(env);
    await runNext(["build"], { env });
    // Next writes the static site to <work>/out; move it into the consumer's project.
    const from = path.join(WORK_DIR, "out");
    const to = path.join(CONTENT_DIR, "out");
    if (fs.existsSync(from) && from !== to) {
      fs.rmSync(to, { recursive: true, force: true });
      fs.cpSync(from, to, { recursive: true });
      fs.rmSync(from, { recursive: true, force: true });
    }
    console.log(`\n  Static site exported to ${path.join(CONTENT_DIR, "out")}\n`);
  },

  version() {
    console.log(`markline ${readPkgVersion()}`);
  },

  help() {
    console.log(`
  Markline — open-source documentation framework

  Usage: markline <command>

  Commands:
    init [dir]   Scaffold a new docs project (markline.json + sample content)
    dev          Start the dev server against ./markline.json
    build        Build a production server bundle (Docker / Vercel / start)
    start        Serve a production build
    export       Build a static HTML site into ./out (any CDN / Pages / S3)
    version      Print the Markline version
    help         Show this help

  Content lives in the current directory: markline.json, docs/*.mdx, api/openapi.json
`);
  },
};

async function main() {
  const [cmd = "help", ...args] = process.argv.slice(2);
  const handler = COMMANDS[cmd] ?? (cmd === "--version" || cmd === "-v" ? COMMANDS.version : null) ?? (cmd === "--help" || cmd === "-h" ? COMMANDS.help : null);
  if (!handler) {
    console.error(`  Unknown command: ${cmd}\n`);
    COMMANDS.help();
    process.exit(1);
  }
  try {
    await handler(args);
  } catch (err) {
    console.error(`\n  ${err instanceof Error ? err.message : err}\n`);
    process.exit(1);
  }
}

main();
