const METHODS = ["get", "post", "put", "patch", "delete", "options", "head"];

// Plain-JS mirror of lib/openapi-tag-config.ts for the build script, which
// runs under plain node. test/openapi-tag-config.test.ts checks that the two
// agree, so change both together.

const DEFAULT_HIDE_EXTENSIONS = ["x-hidden", "x-internal"];

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function override(api, name) {
  const tags = api?.tags;
  return tags && Object.prototype.hasOwnProperty.call(tags, name) ? tags[name] : undefined;
}

/** A spec tag after `api.tags` mergeInto chains; null when hidden. */
export function resolveTag(name, api) {
  const seen = new Set();
  let cur = name;
  while (!seen.has(cur)) {
    seen.add(cur);
    const o = override(api, cur);
    if (o?.hidden) return null;
    const next = typeof o?.mergeInto === "string" ? o.mergeInto.trim() : "";
    if (!next) break;
    cur = next;
  }
  return cur;
}

function primaryTag(opTags, api) {
  const list = Array.isArray(opTags) && opTags.length ? opTags : ["Default"];
  for (const t of list) {
    if (typeof t !== "string") continue;
    const r = resolveTag(t, api);
    if (r) return r;
  }
  return null;
}

/** Whether an operation is left out of the reference (`api.hideExtensions`,
 *  `api.showDeprecated: false`). */
export function isHiddenOperation(op, api) {
  if (api?.showDeprecated === false && op.deprecated === true) return true;
  return (api?.hideExtensions ?? DEFAULT_HIDE_EXTENSIONS).some((ext) => !!op[ext]);
}

function isHiddenItem(item, api) {
  return (api?.hideExtensions ?? DEFAULT_HIDE_EXTENSIONS).some((ext) => !!item?.[ext]);
}

/** A spec's tag list can hold anything; only named entries mean a tag. */
function specTagList(spec) {
  return (Array.isArray(spec.tags) ? spec.tags : []).filter((t) => typeof t?.name === "string");
}

function knownTags(spec) {
  const known = new Set(specTagList(spec).map((t) => t.name));
  for (const item of Object.values(spec.paths ?? {})) {
    for (const method of METHODS) {
      const op = item?.[method];
      if (!op) continue;
      if (Array.isArray(op.tags) && op.tags.length) for (const t of op.tags) known.add(t);
      else known.add("Default");
    }
  }
  return known;
}

function mergeCycle(name, api) {
  const seen = new Set();
  let cur = name;
  while (!seen.has(cur)) {
    seen.add(cur);
    const next = override(api, cur)?.mergeInto;
    if (typeof next !== "string" || !next.trim()) return false;
    cur = next.trim();
  }
  return true;
}

function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    row = next;
  }
  return row[b.length];
}

function closeName(known, target) {
  const a = known.toLowerCase();
  const b = target.toLowerCase();
  if (a === b) return true;
  return Math.min(a.length, b.length) >= 4 && editDistance(a, b, 2) <= 2;
}

function configWarnings(known, order, alias, api) {
  const out = [];
  const isPath = (name) => order.some((p) => p === name || p.startsWith(`${name}/`));
  for (const [name, o] of Object.entries(api?.tags ?? {})) {
    if (!known.has(name) && !isPath(name)) {
      out.push(`[markline] api.tags: "${name}" matches no tag in the spec, so it has no effect. Check the spelling.`);
    }
    const target = typeof o?.mergeInto === "string" ? o.mergeInto.trim() : "";
    if (!target) continue;
    if (mergeCycle(name, api)) {
      out.push(`[markline] api.tags: "${name}" is part of a mergeInto cycle. Its operations stay where the cycle stops.`);
    } else if (resolveTag(target, api) === null) {
      out.push(`[markline] api.tags: "${name}" merges into "${target}", which is hidden, so its operations are hidden too.`);
    } else if (!known.has(target) && !override(api, target)?.mergeInto) {
      const near = [...known].find((k) => closeName(k, target));
      if (near) {
        out.push(`[markline] api.tags: "${name}" merges into "${target}", which isn't a tag in the spec, so it creates a new page. Did you mean "${near}"?`);
      }
    }
  }
  for (const name of api?.tagOrder ?? []) {
    const r = resolveTag(name, api);
    if (!r) continue;
    if (alias.has(r)) {
      out.push(`[markline] api.tagOrder: "${name}" was merged into "${alias.get(r)}". List that name instead.`);
    } else if (!order.includes(r)) {
      out.push(`[markline] api.tagOrder: "${name}" matches no tag with operations, so it has no effect. Check the spelling.`);
    }
  }
  return out;
}

/** Mirrors sectionSource() in lib/openapi-tag-config.ts. */
export function sectionSource(configured, specGroups) {
  const parse = (list, key) =>
    (Array.isArray(list) ? list : [])
      .filter((g) => g && typeof g[key] === "string" && g[key].trim() && Array.isArray(g.tags))
      .map((g) => ({ title: g[key].trim(), tags: g.tags.filter((t) => typeof t === "string") }));
  if (Array.isArray(configured)) return { sections: parse(configured, "title"), fromSpec: false };
  return { sections: parse(specGroups, "name"), fromSpec: true };
}

/** Mirrors planSections() in lib/openapi-tag-config.ts. */
export function planSections(sections, order, alias, known, api) {
  const warnings = [];
  const placedIn = new Map();
  const out = [];
  for (const section of sections) {
    const pages = [];
    for (const name of section.tags) {
      const resolved = resolveTag(name, api);
      if (resolved === null) continue;
      const page = alias.get(resolved) ?? resolved;
      const matches = order.filter((p) => p === page || p.startsWith(`${page}/`));
      if (!matches.length) {
        const near = [...known].find((k) => closeName(k, name));
        warnings.push(
          `[markline] API sections: "${name}" in "${section.title}" matches no tag with operations, so it has no effect.${near && near !== name ? ` Did you mean "${near}"?` : ""}`,
        );
        continue;
      }
      for (const p of matches) {
        const already = placedIn.get(p);
        if (already === undefined) {
          placedIn.set(p, section.title);
          pages.push(p);
        } else if (already !== section.title) {
          warnings.push(`[markline] API sections: "${name}" is in "${already}" and "${section.title}"; it stays in "${already}".`);
        }
      }
    }
    if (pages.length) out.push({ title: section.title, tags: pages });
    else warnings.push(`[markline] API sections: "${section.title}" has no tags with operations, so it isn't shown.`);
  }
  const placed = out.flatMap((s) => s.tags);
  const rest = order.filter((p) => !placedIn.has(p));
  return { sections: out, order: [...placed, ...rest], warnings };
}

/**
 * Every operation that gets a page, with the resource tag it files under —
 * mirroring normalize() in lib/openapi.ts, so llms.txt, search and the sitemap
 * never link to a page that doesn't exist. Tags whose slugs collide are folded
 * into the first one. `warnings` is what the site build should print.
 */
export function resourcePlan(spec, api) {
  const ops = [];
  const used = [];
  for (const [pathStr, item] of Object.entries(spec.paths ?? {})) {
    if (isHiddenItem(item, api)) continue;
    for (const method of METHODS) {
      const op = item?.[method];
      if (!op || isHiddenOperation(op, api)) continue;
      const tag = primaryTag(op.tags, api);
      if (!tag) continue;
      ops.push({ method, path: pathStr, op, tag });
      if (!used.includes(tag)) used.push(tag);
    }
  }

  const usedSet = new Set(used);
  const declared = specTagList(spec).map((t) => resolveTag(t.name, api)).filter((n) => n && usedSet.has(n));
  const pinned = (api?.tagOrder ?? []).map((n) => resolveTag(n, api)).filter((n) => n && usedSet.has(n));
  const declaredSet = new Set(declared);
  const rest = used.filter((n) => !declaredSet.has(n)).sort((a, b) => a.localeCompare(b));
  const pinnedSet = new Set(pinned);
  const ranked = [...new Set([...pinned, ...declared.filter((n) => !pinnedSet.has(n)), ...rest])];

  const bySlug = new Map();
  const alias = new Map();
  const collisions = new Map();
  for (const name of new Set([...declared, ...used])) {
    const s = slug(name);
    const owner = bySlug.get(s);
    if (owner === undefined) {
      bySlug.set(s, name);
      continue;
    }
    alias.set(name, owner);
    const c = collisions.get(s) ?? { slug: s, names: [owner], into: owner };
    c.names.push(name);
    collisions.set(s, c);
  }
  for (const o of ops) o.tag = alias.get(o.tag) ?? o.tag;
  const tags = [...new Set(ranked.map((n) => alias.get(n) ?? n))];
  const warnings = [...collisions.values()].map((c) => {
    const names = c.names.map((n) => `"${n}"`).join(", ");
    return `[markline] API tags ${names} share the URL /api-reference/${c.slug}; their operations are merged into "${c.into}". Use api.tags (label / mergeInto) in markline.json to rename or merge them explicitly.`;
  });
  warnings.push(...configWarnings(knownTags(spec), tags, alias, api));
  // Sections only reorder and group the pages, as in normalize().
  const sectioned = planSections(sectionSource(api?.sections, spec["x-tagGroups"]).sections, tags, alias, knownTags(spec), api);
  warnings.push(...sectioned.warnings);
  return { tags: sectioned.order, sections: sectioned.sections, alias, ops, collisions: [...collisions.values()], warnings };
}

/** The resources that get a page, in sidebar order. */
export function orderedResourceTags(spec, api) {
  return resourcePlan(spec, api).tags;
}

const ACRONYMS = {
  api: "API", sdk: "SDK", url: "URL", id: "ID", ip: "IP", fx: "FX",
  kyc: "KYC", otp: "OTP", pin: "PIN", sms: "SMS", us: "US", uk: "UK", eu: "EU",
  ngn: "NGN", usd: "USD", gbp: "GBP", eur: "EUR",
};

function segmentDisplayName(seg) {
  const words = seg.replace(/[-_]/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/\s+/).filter(Boolean);
  if (!words.length) return seg;
  return words
    .map((w) => {
      const lw = w.toLowerCase();
      return Object.prototype.hasOwnProperty.call(ACRONYMS, lw) ? ACRONYMS[lw] : w[0].toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

/**
 * Each resource page with its title and description, by the same rule as
 * describeTags() in lib/openapi-tag-config.ts, so llms.txt reads like the site.
 */
export function resourcePages(spec, api) {
  const plan = resourcePlan(spec, api);
  const specTags = new Map(specTagList(spec).map((t) => [t.name, t]));
  const names = [...new Set([...specTags.keys(), ...plan.alias.keys(), ...Object.keys(api?.tags ?? {})])];
  const pageOf = (n) => {
    const r = resolveTag(n, api);
    return r && (plan.alias.get(r) ?? r);
  };
  const sectionOf = new Map(plan.sections.flatMap((s) => s.tags.map((t) => [t, s.title])));
  return plan.tags.map((page) => {
    const merged = names.filter((n) => n !== page && pageOf(n) === page);
    const xDisplay = specTags.get(page)?.["x-displayName"];
    const label =
      [page, ...merged].map((n) => override(api, n)?.label?.trim()).find(Boolean) ??
      (typeof xDisplay === "string" ? xDisplay.trim() : "");
    const description =
      override(api, page)?.description ??
      specTags.get(page)?.description ??
      merged.map((n) => override(api, n)?.description ?? specTags.get(n)?.description).find((d) => d !== undefined);
    const segments = page.split("/").map((s) => s.trim()).filter(Boolean);
    return {
      name: page,
      slug: slug(page),
      title: label || segmentDisplayName(segments[segments.length - 1] ?? page),
      description,
      // Its sidebar section, or null when it's in none (or there are none).
      section: sectionOf.get(page) ?? null,
    };
  });
}

function slugifyOpId(method, pathStr) {
  return `${method}_${pathStr.replace(/[^a-zA-Z0-9]+/g, "_")}`.replace(/^_+|_+$/g, "");
}

/** Search records for the operations that get a page. A hidden tag's name stays
 *  out of the text, so hiding `access:all` doesn't leave it searchable. */
export function apiSearchRecords(spec, api, toPlainText = (s) => s) {
  return resourcePlan(spec, api).ops.map(({ method, path: pathStr, op }) => {
    const operationId = op.operationId ?? slugifyOpId(method, pathStr);
    const tags = (op.tags ?? []).filter((t) => resolveTag(t, api));
    const content = toPlainText(
      [op.summary, op.description, `${method.toUpperCase()} ${pathStr}`, tags.join(" ")].filter(Boolean).join(" "),
    );
    return { url: `/api-reference/${operationId}`, title: op.summary ?? operationId, content, meta: "API reference" };
  });
}

/** What a build should say about the default spec and each version's (`versions`' first entry is the default). */
export function specWarnings(spec, cfg, readVersion) {
  const out = [...resourcePlan(spec, cfg?.api).warnings];
  for (const v of (Array.isArray(cfg?.versions) ? cfg.versions : []).slice(1)) {
    const versioned = readVersion(v.id);
    if (!versioned) continue;
    for (const w of resourcePlan(versioned, cfg.api).warnings) out.push(w.replace("[markline]", `[markline] (version ${v.id})`));
  }
  return out;
}
