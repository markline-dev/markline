// Project scaffolding shared by `markline init` and `npm create @markline`.
// Dependency-free: @markline/create copies this file in at publish time.

import fs from "node:fs";
import path from "node:path";

export function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

export function isLocalTemplate(spec) {
  return spec.startsWith("./") || spec.startsWith("../") || path.isAbsolute(spec);
}

/**
 * Write a new project into `target`: the default starter from `initDir`, then,
 * with a template, its starter files on top and `"template"` recorded in
 * markline.json. `spec` is what the user typed; `tplDir` is where it resolved.
 */
export function scaffold(target, { initDir, spec, tplDir }) {
  copyDir(initDir, target);
  if (!tplDir) return;

  // The template's starter files replace the matching default ones.
  const starter = path.join(tplDir, "starter");
  if (fs.existsSync(starter)) {
    copyDir(starter, target);
    // A starter with its own navigation and no API tab (a help center, say)
    // doesn't want the default starter's sample spec: Markline builds an API
    // reference whenever api/openapi.json exists, and nothing would link to it.
    const own = path.join(starter, "markline.json");
    if (fs.existsSync(own) && !fs.existsSync(path.join(starter, "api"))) {
      const tabs = JSON.parse(fs.readFileSync(own, "utf8")).navigation?.tabs ?? [];
      if (!tabs.some((t) => t.openapi)) fs.rmSync(path.join(target, "api"), { recursive: true, force: true });
    }
  }

  // Record the template. A local path is rewritten relative to the new
  // markline.json, since that's what it resolves against at build time.
  const cfgPath = path.join(target, "markline.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  const relDir = path.relative(target, tplDir).split(path.sep).join("/");
  const value = isLocalTemplate(spec) ? (relDir.startsWith("../") ? relDir : `./${relDir}`) : spec;
  // The default starter ships its own colours and appearance; with a template
  // those would override it (user config wins), so the new project would never
  // look like the template. Keep only the logo.
  if (cfg.theme) cfg.theme = cfg.theme.logo ? { logo: cfg.theme.logo } : undefined;
  const { name, ...restCfg } = cfg;
  fs.writeFileSync(cfgPath, JSON.stringify({ name, template: value, ...restCfg }, null, 2) + "\n");
}
