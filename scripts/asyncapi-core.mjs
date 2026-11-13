/**
 * AsyncAPI → one model of WebSocket channels for the API reference. Plain JS so
 * the build script (scripts/build-search.mjs) runs the same code as the pages;
 * lib/asyncapi.ts is its typed front, with the types in asyncapi-core.d.mts.
 *
 * AsyncAPI 2.x and 3.0 describe the same things differently, and name message
 * direction from opposite sides:
 *  - 2.x: an operation under `publish` is what *clients* send to the described
 *    application; `subscribe` is what they receive from it.
 *  - 3.0: an operation with `action: send` is the described application sending,
 *    so a client receives it; `action: receive` is what a client sends.
 * Both become `send` / `receive` from the client's side, which is what a reader
 * of an API reference is. A 2.x document written from the client's side reads
 * correctly with `api.asyncapi.perspective: "client"`.
 *
 * Everything but `readAsyncApiFile` is pure, and all of it is unit-tested.
 */
import fs from "node:fs";
import path from "node:path";

/** From the client's side: what it sends, what it receives, or (a 3.0 message no operation names) not said. */

const isNode = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v) => (typeof v === "string" && v.trim() ? v : undefined);

/** Local `$ref`s only (`#/…`), through chains; undefined when missing, external or a cycle. */
class Refs {
  root;
  warnings;
  exts;
  warned = new Set();
  constructor(root, warnings, exts = []) {
    this.root = root;
    this.warnings = warnings;
    this.exts = exts;
  }

  /** The node itself, or what its `$ref` points at. */
  get(node, seen = new Set()) {
    if (!isNode(node)) return undefined;
    const ref = node.$ref;
    if (typeof ref !== "string") return node;
    if (!ref.startsWith("#/")) return this.warn(`[markline] AsyncAPI: "${ref}" points outside the document, so it's skipped.`);
    if (seen.has(ref)) return this.warn(`[markline] AsyncAPI: "${ref}" refers back to itself, so it's skipped.`);
    seen.add(ref);
    let cur = this.root;
    for (const part of ref.slice(2).split("/")) {
      const key = part.replace(/~1/g, "/").replace(/~0/g, "~");
      cur = isNode(cur) ? cur[key] : undefined;
    }
    if (cur === undefined) return this.warn(`[markline] AsyncAPI: "${ref}" points at nothing, so it's skipped.`);
    return this.get(cur, seen);
  }

  /**
   * Whether `api.hideExtensions` hides this node: a flag on it, or on what its
   * `$ref` points at. Hidden channels, operations and messages are left out, the
   * way hidden operations are.
   */
  hidden(node) {
    if (!this.exts.length || !isNode(node)) return false;
    const flagged = (n) => isNode(n) && this.exts.some((e) => !!n[e]);
    return flagged(node) || (typeof node.$ref === "string" && flagged(this.get(node)));
  }

  /** The last segment of a `$ref`, as a fallback name ("#/components/messages/Ping" → "Ping"). */
  static key(node) {
    const ref = isNode(node) ? node.$ref : undefined;
    return typeof ref === "string" ? ref.split("/").pop()?.replace(/~1/g, "/").replace(/~0/g, "~") : undefined;
  }

  warn(message) {
    if (!this.warned.has(message)) {
      this.warned.add(message);
      this.warnings.push(message);
    }
    return undefined;
  }
}

/** Resolve a schema's `$ref`s all the way down, so it reads without the document. */
function deref(schema, refs, seen = new Set()) {
  const ref = isNode(schema) && typeof schema.$ref === "string" ? schema.$ref : undefined;
  // Keys beside a `$ref` (a description, `deprecated`, a hide flag) apply to this
  // use of the target, over the target's own, as in OpenAPI 3.1.
  const siblings = ref ? Object.fromEntries(Object.entries(schema).filter(([k]) => k !== "$ref")) : {};
  if (ref && seen.has(ref)) return { type: "object", description: "(recursive)", ...siblings };
  const node = refs.get(schema);
  if (!node) return undefined;
  const next = ref ? new Set([...seen, ref]) : seen;
  const out = { ...node, ...siblings };
  delete out.$ref;
  for (const key of ["properties", "patternProperties"]) {
    if (isNode(node[key])) out[key] = Object.fromEntries(Object.entries(node[key]).map(([k, v]) => [k, deref(v, refs, next) ?? {}]));
  }
  for (const key of ["items", "additionalProperties", "not"]) {
    if (isNode(node[key])) out[key] = deref(node[key], refs, next);
  }
  for (const key of ["allOf", "anyOf", "oneOf"]) {
    if (Array.isArray(node[key])) out[key] = node[key].map((s) => deref(s, refs, next) ?? {});
  }
  return out;
}

/** A server's full URL: 3.0's `protocol` + `host` + `pathname`, or 2.x's `url` (with `protocol` when it has none). */
function serverUrl(s) {
  const protocol = str(s.protocol);
  if (str(s.host)) return `${protocol ? `${protocol}://` : ""}${s.host}${str(s.pathname) ?? ""}`;
  const url = str(s.url);
  if (!url) return undefined;
  return url.includes("://") || !protocol ? url : `${protocol}://${url}`;
}

/** One message, from a message object (or a `$ref` to one). */
const examplesOf = (node) =>
  Array.isArray(node?.examples)
    ? node.examples.map((e) => (isNode(e) && "payload" in e ? e.payload : e)).filter((e) => e !== undefined)
    : node?.example !== undefined
      ? [node.example]
      : [];

const idPart = (s) => s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "message";

/**
 * The messages a message object stands for. Usually one; but a message whose
 * payload is a `oneOf` of kinds (one "client message" covering init, text and
 * close) is one per kind, named from the kind's `title`, its `$ref` key, or its
 * place, with its own examples.
 */
function messagesOf(raw, fallbackId, direction, refs) {
  const m = refs.get(raw);
  if (!m || refs.hidden(raw)) return [];
  const id = Refs.key(raw) ?? fallbackId;
  const base = {
    contentType: str(m.contentType),
    direction,
    deprecated: m.deprecated === true || undefined,
  };
  const payload = refs.get(m.payload);
  if (payload && Array.isArray(payload.oneOf) && !payload.properties) {
    return payload.oneOf.flatMap((member, i) => {
      const kind = refs.get(member);
      if (!kind || refs.hidden(member)) return [];
      const name = str(kind.title) ?? Refs.key(member) ?? `Message ${i + 1}`;
      return [
        {
          ...base,
          id: `${id}-${idPart(name)}`,
          name,
          summary: str(kind.summary),
          description: str(kind.description),
          payload: deref(member, refs),
          examples: examplesOf(kind),
          deprecated: base.deprecated || kind.deprecated === true || undefined,
        },
      ];
    });
  }
  return [
    {
      ...base,
      id,
      name: str(m.name) ?? str(m.messageId) ?? id,
      title: str(m.title),
      summary: str(m.summary),
      description: str(m.description),
      payload: deref(m.payload, refs),
      examples: examplesOf(m),
    },
  ];
}

/** A 2.x operation's messages: `message` is one message or a `oneOf` list of them. */
function operationMessages(op, direction, channelId, refs) {
  if (!op || refs.hidden(op)) return [];
  const m = refs.get(op.message);
  if (!m) return [];
  const list = Array.isArray(m.oneOf) ? m.oneOf : [op.message];
  return list.flatMap((x, i) => messagesOf(x, `${channelId}-${direction}-${i}`, direction, refs));
}

/** A summary that's only an operation keyword ("subscribe") says nothing as a title. */
const said = (v) => {
  const s = str(v);
  return s && !/^(publish|subscribe|send|receive)$/i.test(s.trim()) ? s : undefined;
};

/** A channel's address as a title: its last plain segment ("stream-input" → "Stream input"). */
function readable(address) {
  const segs = address.split("/").filter((x) => x && !/^\{.*\}$/.test(x) && !/^v\d+$/i.test(x));
  const last = (segs[segs.length - 1] ?? address).replace(/[-_]+/g, " ").trim();
  return last ? last[0].toUpperCase() + last.slice(1) : address;
}

const tagNames = (...lists) => [
  ...new Set(
    lists.flatMap((l) => (Array.isArray(l) ? l : [])).map((t) => (typeof t === "string" ? t : str(t?.name))).filter((t) => !!t),
  ),
];

function wsBinding(channel, refs) {
  const ws = refs.get(refs.get(channel.bindings)?.ws);
  return { query: deref(ws?.query, refs), headers: deref(ws?.headers, refs) };
}

function channelServers(names, all, refs) {
  if (!Array.isArray(names) || !names.length) return Object.values(all);
  return names
    .map((n) => (typeof n === "string" ? all[n] : (Refs.key(n) && all[Refs.key(n)]) || serverUrl(refs.get(n) ?? {})))
    .filter((u) => !!u);
}

function v2(raw, refs, servers, perspective) {
  // `publish` is what the described application receives: a client sends it. A
  // document written from the client's side means the opposite.
  const [pub, sub] = perspective === "client" ? ["receive", "send"] : ["send", "receive"];
  return Object.entries(isNode(raw.channels) ? raw.channels : {}).flatMap(([address, value]) => {
    const ch = refs.get(value);
    if (!ch || refs.hidden(value)) return [];
    // A channel whose operations are all hidden goes with them.
    const ops = [ch.publish, ch.subscribe].filter((o) => o !== undefined);
    if (ops.length && ops.every((o) => refs.hidden(o))) return [];
    const publish = refs.hidden(ch.publish) ? undefined : refs.get(ch.publish);
    const subscribe = refs.hidden(ch.subscribe) ? undefined : refs.get(ch.subscribe);
    const parameters = Object.entries(isNode(ch.parameters) ? ch.parameters : {}).map(([name, p]) => {
      const param = refs.get(p);
      return { name, description: str(param?.description), schema: deref(param?.schema, refs) };
    });
    return [
      {
        id: address,
        address,
        title: str(ch["x-title"]) ?? said(publish?.summary) ?? said(subscribe?.summary) ?? readable(address),
        summary: said(publish?.summary) ?? said(subscribe?.summary),
        description: str(ch.description) ?? str(publish?.description) ?? str(subscribe?.description),
        tags: tagNames(publish?.tags, subscribe?.tags, ch.tags),
        servers: channelServers(ch.servers, servers, refs),
        parameters,
        ...wsBinding(ch, refs),
        messages: [...operationMessages(publish, pub, address, refs), ...operationMessages(subscribe, sub, address, refs)],
        deprecated: ch.deprecated === true || publish?.deprecated === true || subscribe?.deprecated === true || undefined,
      },
    ];
  });
}

function v3(raw, refs, servers) {
  const channels = isNode(raw.channels) ? raw.channels : {};
  // Which way each of a channel's messages goes, from the operations that use it.
  const directions = new Map();
  const opTags = new Map();
  const opText = new Map();
  // Channels some operation uses, and those a visible one does: one used only by hidden operations is hidden.
  const used = new Set();
  const usedVisibly = new Set();
  const hiddenNames = new Map();
  for (const value of Object.values(isNode(raw.operations) ? raw.operations : {})) {
    const op = refs.get(value);
    const ref = isNode(op?.channel) ? op.channel.$ref : undefined;
    const channelKey = typeof ref === "string" && ref.startsWith("#/channels/") ? ref.slice("#/channels/".length).replace(/~1/g, "/").replace(/~0/g, "~") : undefined;
    if (!op || !channelKey || !(channelKey in channels)) continue;
    used.add(channelKey);
    const ch = refs.get(channels[channelKey]);
    // An operation's `messages` are `$ref`s into its channel's messages; without them, it uses them all.
    const named = Array.isArray(op.messages)
      ? op.messages.map((m) => Refs.key(m)).filter((k) => !!k)
      : Object.keys(isNode(ch?.messages) ? ch.messages : {});
    if (refs.hidden(value)) {
      // Its messages go with it, unless a visible operation uses them too.
      hiddenNames.set(channelKey, new Set([...(hiddenNames.get(channelKey) ?? []), ...named]));
      continue;
    }
    usedVisibly.add(channelKey);
    // `send` is the described application sending: a client receives it.
    const direction = op.action === "send" ? "receive" : op.action === "receive" ? "send" : "unspecified";
    const byMessage = directions.get(channelKey) ?? new Map();
    for (const key of named) byMessage.set(key, new Set([...(byMessage.get(key) ?? []), direction]));
    directions.set(channelKey, byMessage);
    opTags.set(channelKey, tagNames(opTags.get(channelKey), op.tags));
    const text = opText.get(channelKey) ?? {};
    opText.set(channelKey, {
      title: text.title ?? str(op.title),
      summary: text.summary ?? str(op.summary),
      description: text.description ?? str(op.description),
      deprecated: text.deprecated || op.deprecated === true,
    });
  }

  return Object.entries(channels).flatMap(([key, value]) => {
    const ch = refs.get(value);
    if (!ch || refs.hidden(value) || (used.has(key) && !usedVisibly.has(key))) return [];
    const address = str(ch.address) ?? key;
    const parameters = Object.entries(isNode(ch.parameters) ? ch.parameters : {}).map(([name, p]) => {
      const param = refs.get(p);
      // 3.0 parameters are strings, described by enum / default / examples rather than a schema.
      const schema = { type: "string" };
      if (Array.isArray(param?.enum)) schema.enum = param.enum;
      if (param?.default !== undefined) schema.default = param.default;
      if (Array.isArray(param?.examples)) schema.examples = param.examples;
      return { name, description: str(param?.description), schema };
    });
    const byMessage = directions.get(key) ?? new Map();
    const messages = Object.entries(isNode(ch.messages) ? ch.messages : {}).flatMap(([name, m]) => {
      if (!byMessage.has(name) && hiddenNames.get(key)?.has(name)) return [];
      const ways = [...(byMessage.get(name) ?? new Set(["unspecified"]))];
      // A message used both ways is listed once for each.
      return ways.flatMap((way) => messagesOf(m, name, way, refs));
    });
    const text = opText.get(key) ?? {};
    return [
      {
        id: key,
        address,
        title: str(ch.title) ?? said(text.title) ?? said(text.summary) ?? readable(address),
        summary: said(str(ch.summary)) ?? said(text.summary),
        description: str(ch.description) ?? text.description,
        tags: tagNames(ch.tags, opTags.get(key)),
        servers: channelServers(ch.servers, servers, refs),
        parameters,
        ...wsBinding(ch, refs),
        messages,
        deprecated: ch.deprecated === true || text.deprecated || undefined,
      },
    ];
  });
}

/** Read an AsyncAPI document. One it can't read gives no channels and a warning, never a throw. */
export function normalizeAsyncApi(input, opts = {}) {
  const warnings = [];
  const raw = isNode(input) ? input : {};
  const version = str(raw.asyncapi) ?? "";
  const info = isNode(raw.info) ? raw.info : {};
  const out = {
    version,
    info: { title: str(info.title) ?? "", version: str(info.version) ?? "", description: str(info.description) },
    channels: [],
    // Sidebar groups, as OpenAPI's `x-tagGroups`: `[{ name, tags }]`.
    tagGroups: Array.isArray(raw["x-tagGroups"]) ? raw["x-tagGroups"] : undefined,
    warnings,
  };
  const major = /^(\d+)\./.exec(version)?.[1];
  if (major !== "2" && major !== "3") {
    warnings.push(
      version
        ? `[markline] AsyncAPI ${version} isn't supported (2.x and 3.0 are), so its channels aren't shown.`
        : `[markline] The AsyncAPI document has no "asyncapi" version, so its channels aren't shown.`,
    );
    return out;
  }
  if (major === "3" && !/^3\.0\./.test(version)) {
    warnings.push(`[markline] AsyncAPI ${version} is newer than 3.0, so its channels aren't shown.`);
    return out;
  }
  const refs = new Refs(raw, warnings, opts.hideExtensions ?? []);
  const servers = {};
  for (const [name, s] of Object.entries(isNode(raw.servers) ? raw.servers : {})) {
    const url = serverUrl(refs.get(s) ?? {});
    if (url) servers[name] = url;
  }
  const perspective = opts.perspective ?? "server";
  if (major === "2" && perspective === "client") {
    // Said once, so a wrong choice (Send and Receive swapped) is easy to spot.
    warnings.push(`[markline] AsyncAPI 2.x read from the client's side (api.asyncapi.perspective is "client").`);
  }
  out.channels = major === "2" ? v2(raw, refs, servers, perspective) : v3(raw, refs, servers);
  return out;
}

/**
 * Which resource page a WebSocket channel goes on. Pure, so the rule is tested.
 *
 * A channel joins the resource of its first tag that is one. Without a tag that
 * matches, it joins the resource whose operations share the longest leading run
 * of path segments with it, comparing paths without the host (`/v1/tts/{id}/stream`
 * shares `tts/{id}` with `/v1/tts/{id}`). A leading version segment (`v1`) doesn't
 * count, on either side, or every `/v1/…` path would match. A tie goes to the
 * resource that comes first in the reference. With no shared segment it goes to
 * `rest`, which the reference lists under "WebSockets".
 */
const segments = (address) => {
  const segs = address.split(/[?#]/)[0].replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, "").split("/").filter(Boolean);
  return /^v\d+$/i.test(segs[0] ?? "") ? segs.slice(1) : segs;
};

/** Leading segments two paths share; `{param}`s match any `{param}`. */
function shared(a, b) {
  let n = 0;
  while (n < a.length && n < b.length) {
    const x = a[n];
    const y = b[n];
    const bothParams = /^\{.*\}$/.test(x) && /^\{.*\}$/.test(y);
    if (x.toLowerCase() !== y.toLowerCase() && !bothParams) break;
    n++;
  }
  return n;
}

export function attachChannels(
  channels,
  resources,
  /** A channel tag → the resource it files under (after `api.tags`), or null when hidden. */
  resourceOfTag = (t) => t,
) {
  const byResource = new Map();
  const rest = [];
  const hidden = [];
  const names = new Set(resources.map((r) => r.name));
  const add = (name, c) => byResource.set(name, [...(byResource.get(name) ?? []), c]);
  for (const c of channels) {
    if (c.tags.length) {
      const resolved = c.tags.map((t) => resourceOfTag(t));
      // Every tag hidden: the channel is hidden with them.
      if (resolved.every((r) => r === null)) {
        hidden.push(c);
        continue;
      }
      const home = resolved.find((r) => !!r && names.has(r));
      if (home) {
        add(home, c);
        continue;
      }
    }
    const own = segments(c.address);
    let best;
    let bestScore = 0;
    for (const r of resources) {
      const score = Math.max(0, ...r.paths.map((p) => shared(own, segments(p))));
      if (score > bestScore) {
        best = r.name;
        bestScore = score;
      }
    }
    if (best) add(best, c);
    else rest.push(c);
  }
  return { byResource, rest, hidden };
}

/** The resource page a channel with nowhere else to go is on. */
export const WEBSOCKETS_TAG = "WebSockets";

/**
 * The AsyncAPI document at `file`, read: null when there's none, else its channels
 * (without what `hideExtensions` flags, and without deprecated channels and
 * messages when `showDeprecated` is false) and its warnings. One
 * it can't read gives no channels and a warning, never a throw.
 */
export function readAsyncApiFile(file, { perspective, showDeprecated, hideExtensions } = {}) {
  if (!fs.existsSync(file)) return null;
  const name = path.basename(file);
  if (!/\.json$/i.test(file)) {
    return { channels: [], warnings: [`[markline] ${name}: only JSON AsyncAPI documents are read for now, so its channels aren't shown.`] };
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return { channels: [], warnings: [`[markline] ${name} isn't valid JSON, so its channels aren't shown.`] };
  }
  const doc = normalizeAsyncApi(raw, { perspective, hideExtensions });
  if (showDeprecated !== false) return { channels: doc.channels, tagGroups: doc.tagGroups, warnings: doc.warnings };
  // Deprecated channels and messages left out, as deprecated operations are.
  const channels = doc.channels.filter((c) => !c.deprecated).map((c) => ({ ...c, messages: c.messages.filter((m) => !m.deprecated) }));
  return { channels, tagGroups: doc.tagGroups, warnings: doc.warnings };
}
