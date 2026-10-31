#!/usr/bin/env node
// Scaffold a new Markline docs project:  npm create @markline@latest my-docs
//
// Pass `--template <name>` to start from a built-in template or a ./folder.
// Self-contained: it only writes the starter files. The scaffolded project
// depends on @markline/markline (installed when the user runs `npm install`),
// so this scaffolder stays tiny and fast.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Published, these sit next to this file (copied by prepublishOnly). In the
// repo they're read from the framework itself.
function firstExisting(...candidates) {
  return candidates.find((p) => fs.existsSync(p));
}
const INIT_DIR = firstExisting(path.join(__dirname, "templates"), path.join(__dirname, "..", "templates", "init"));
const BUILTIN_DIR = firstExisting(path.join(__dirname, "builtin-templates"), path.join(__dirname, "..", "lib", "templates"));
const SCAFFOLD = firstExisting(path.join(__dirname, "scaffold.mjs"), path.join(__dirname, "..", "bin", "scaffold.mjs"));

/** Pull `--template <spec>` / `-t <spec>` / `--template=<spec>` out of argv. */
function parseArgs(argv) {
  const rest = [];
  let template;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--template" || a === "-t") {
      template = argv[++i];
      if (!template) throw new Error("--template needs a value, e.g. --template help-center");
    } else if (a.startsWith("--template=")) template = a.slice("--template=".length);
    else rest.push(a);
  }
  return { dir: rest[0], template };
}

/** Built-in names and ./paths only: an npm template has to be installed first. */
function resolveTemplate(spec, isLocal) {
  const builtins = fs.readdirSync(BUILTIN_DIR).filter((n) => fs.existsSync(path.join(BUILTIN_DIR, n, "template.json")));
  if (spec.startsWith("@") || spec.startsWith("markline-template-")) {
    throw new Error(
      `"${spec}" is an npm package, so it has to be installed first. In an empty folder, run:\n\n` +
        `    npm install @markline/markline ${spec}\n    npx markline init --template ${spec}`,
    );
  }
  const dir = isLocal(spec) ? path.resolve(process.cwd(), spec) : path.join(BUILTIN_DIR, spec);
  if (!fs.existsSync(path.join(dir, "template.json"))) {
    throw new Error(`Template "${spec}" not found. Built-in templates: ${builtins.join(", ")}.`);
  }
  return dir;
}

function sanitizePkgName(name) {
  return name.toLowerCase().replace(/[^a-z0-9-~]/g, "-").replace(/^-+|-+$/g, "") || "my-docs";
}

async function main() {
  if (!INIT_DIR || !BUILTIN_DIR || !SCAFFOLD) throw new Error("Markline starter templates not found.");
  const { scaffold, isLocalTemplate } = await import(pathToFileURL(SCAFFOLD).href);
  const { dir, template } = parseArgs(process.argv.slice(2));
  const target = dir ? path.resolve(process.cwd(), dir) : process.cwd();
  const name = path.basename(target);

  if (fs.existsSync(path.join(target, "markline.json")) || fs.existsSync(path.join(target, "docs.json"))) {
    console.error(`\n  ${target} already contains a markline.json/docs.json — refusing to overwrite.\n`);
    process.exit(1);
  }

  const tplDir = template ? resolveTemplate(template, isLocalTemplate) : undefined;
  fs.mkdirSync(target, { recursive: true });
  scaffold(target, { initDir: INIT_DIR, spec: template, tplDir });

  // Name the scaffolded package after its directory.
  const pkgPath = path.join(target, "package.json");
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    pkg.name = sanitizePkgName(name);
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  } catch {
    /* leave the template name */
  }

  const rel = path.relative(process.cwd(), target) || ".";
  console.log(`\n  Created a Markline docs project in ${rel}${template ? ` using the "${template}" template` : ""}\n`);
  console.log("  Next steps:");
  if (rel !== ".") console.log(`    cd ${rel}`);
  console.log("    npm install");
  console.log("    npm run dev\n");
}

main().catch((err) => {
  console.error(`\n  ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
});
