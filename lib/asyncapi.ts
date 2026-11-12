/**
 * AsyncAPI → one model of WebSocket channels for the API reference.
 *
 * AsyncAPI 2.x and 3.0 describe the same things differently, and name message
 * direction from opposite sides:
 *  - 2.x: an operation under `publish` is what *clients* send to the described
 *    application; `subscribe` is what they receive from it.
 *  - 3.0: an operation with `action: send` is the described application sending,
 *    so a client receives it; `action: receive` is what a client sends.
 * Both become `send` / `receive` from the client's side, which is what a reader
 * of an API reference is. A spec that labels them the other way round is shown
 * as written: there's no telling from the document.
 *
 * Pure (no `@/` imports, no file access), so it's unit-tested.
 */
import type { JSONSchema } from "./openapi";

/** From the client's side: what it sends, what it receives, or (a 3.0 message no operation names) not said. */
export type Direction = "send" | "receive" | "unspecified";

export type AsyncMessage = {
  /** The message's key (component name, or its place in the channel). */
  id: string;
  name: string;
  title?: string;
  summary?: string;
  description?: string;
  contentType?: string;
  payload?: JSONSchema;
  /** Example payloads, as the spec gives them. */
  examples: unknown[];
  direction: Direction;
  deprecated?: boolean;
};

export type AsyncParameter = { name: string; description?: string; schema?: JSONSchema };

export type AsyncChannel = {
  /** Stable key: the 3.0 channel key, or the 2.x address. */
  id: string;
  /** The path a client connects to, with `{parameters}`. */
  address: string;
  title?: string;
  summary?: string;
  description?: string;
  tags: string[];
  /** Full URLs of the servers it's on (`wss://api.example.com`). */
  servers: string[];
  parameters: AsyncParameter[];
  /** `bindings.ws.query`: an object schema of the handshake's query parameters. */
  query?: JSONSchema;
  /** `bindings.ws.headers`: an object schema of the handshake's headers. */
  headers?: JSONSchema;
  messages: AsyncMessage[];
  deprecated?: boolean;
};

export type AsyncDoc = {
  /** The document's `asyncapi` version, or "" when it couldn't be read. */
  version: string;
  info: { title: string; version: string; description?: string };
  channels: AsyncChannel[];
  warnings: string[];
};

type Node = Record<string, any>;
const isNode = (v: unknown): v is Node => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);

/** Local `$ref`s only (`#/…`), through chains; undefined when missing, external or a cycle. */
class Refs {
  private root: Node;
  private warnings: string[];
  private warned = new Set<string>();
  constructor(root: Node, warnings: string[]) {
    this.root = root;
    this.warnings = warnings;
  }

  /** The node itself, or what its `$ref` points at. */
  get(node: unknown, seen = new Set<string>()): Node | undefined {
    if (!isNode(node)) return undefined;
    const ref = node.$ref;
    if (typeof ref !== "string") return node;
    if (!ref.startsWith("#/")) return this.warn(`[markline] AsyncAPI: "${ref}" points outside the document, so it's skipped.`);
    if (seen.has(ref)) return this.warn(`[markline] AsyncAPI: "${ref}" refers back to itself, so it's skipped.`);
    seen.add(ref);
    let cur: unknown = this.root;
    for (const part of ref.slice(2).split("/")) {
      const key = part.replace(/~1/g, "/").replace(/~0/g, "~");
      cur = isNode(cur) ? cur[key] : undefined;
    }
    if (cur === undefined) return this.warn(`[markline] AsyncAPI: "${ref}" points at nothing, so it's skipped.`);
    return this.get(cur, seen);
  }

  /** The last segment of a `$ref`, as a fallback name ("#/components/messages/Ping" → "Ping"). */
  static key(node: unknown): string | undefined {
    const ref = isNode(node) ? node.$ref : undefined;
    return typeof ref === "string" ? ref.split("/").pop()?.replace(/~1/g, "/").replace(/~0/g, "~") : undefined;
  }

  private warn(message: string): undefined {
    if (!this.warned.has(message)) {
      this.warned.add(message);
      this.warnings.push(message);
    }
    return undefined;
  }
}

/** Resolve a schema's `$ref`s all the way down, so it reads without the document. */
function deref(schema: unknown, refs: Refs, seen = new Set<string>()): JSONSchema | undefined {
  const ref = isNode(schema) && typeof schema.$ref === "string" ? schema.$ref : undefined;
  if (ref && seen.has(ref)) return { type: "object", description: "(recursive)" };
  const node = refs.get(schema);
  if (!node) return undefined;
  const next = ref ? new Set([...seen, ref]) : seen;
  const out: Node = { ...node };
  delete out.$ref;
  for (const key of ["properties", "patternProperties"] as const) {
    if (isNode(node[key])) out[key] = Object.fromEntries(Object.entries(node[key]).map(([k, v]) => [k, deref(v, refs, next) ?? {}]));
  }
  for (const key of ["items", "additionalProperties", "not"] as const) {
    if (isNode(node[key])) out[key] = deref(node[key], refs, next);
  }
  for (const key of ["allOf", "anyOf", "oneOf"] as const) {
    if (Array.isArray(node[key])) out[key] = node[key].map((s: unknown) => deref(s, refs, next) ?? {});
  }
  return out as JSONSchema;
}

/** A server's full URL: 3.0's `protocol` + `host` + `pathname`, or 2.x's `url` (with `protocol` when it has none). */
function serverUrl(s: Node): string | undefined {
  const protocol = str(s.protocol);
  if (str(s.host)) return `${protocol ? `${protocol}://` : ""}${s.host}${str(s.pathname) ?? ""}`;
  const url = str(s.url);
  if (!url) return undefined;
  return url.includes("://") || !protocol ? url : `${protocol}://${url}`;
}

/** One message, from a message object (or a `$ref` to one). */
function message(raw: unknown, fallbackId: string, direction: Direction, refs: Refs): AsyncMessage | undefined {
  const m = refs.get(raw);
  if (!m) return undefined;
  const id = Refs.key(raw) ?? fallbackId;
  const examples = Array.isArray(m.examples)
    ? m.examples.map((e: unknown) => (isNode(e) && "payload" in e ? e.payload : e)).filter((e: unknown) => e !== undefined)
    : [];
  return {
    id,
    name: str(m.name) ?? str(m.messageId) ?? id,
    title: str(m.title),
    summary: str(m.summary),
    description: str(m.description),
    contentType: str(m.contentType),
    payload: deref(m.payload, refs),
    examples,
    direction,
    deprecated: m.deprecated === true || undefined,
  };
}

/** A 2.x operation's messages: `message` is one message or a `oneOf` list of them. */
function operationMessages(op: Node | undefined, direction: Direction, channelId: string, refs: Refs): AsyncMessage[] {
  if (!op) return [];
  const m = refs.get(op.message);
  if (!m) return [];
  const list = Array.isArray(m.oneOf) ? m.oneOf : [op.message];
  return list
    .map((x: unknown, i: number) => message(x, `${channelId}-${direction}-${i}`, direction, refs))
    .filter((x: AsyncMessage | undefined): x is AsyncMessage => !!x);
}

const tagNames = (...lists: unknown[]): string[] => [
  ...new Set(
    lists.flatMap((l) => (Array.isArray(l) ? l : [])).map((t) => (typeof t === "string" ? t : str(t?.name))).filter((t): t is string => !!t),
  ),
];

function wsBinding(channel: Node, refs: Refs): { query?: JSONSchema; headers?: JSONSchema } {
  const ws = refs.get(refs.get(channel.bindings)?.ws);
  return { query: deref(ws?.query, refs), headers: deref(ws?.headers, refs) };
}

function channelServers(names: unknown, all: Record<string, string>, refs: Refs): string[] {
  if (!Array.isArray(names) || !names.length) return Object.values(all);
  return names
    .map((n) => (typeof n === "string" ? all[n] : (Refs.key(n) && all[Refs.key(n)!]) || serverUrl(refs.get(n) ?? {})))
    .filter((u): u is string => !!u);
}

function v2(raw: Node, refs: Refs, servers: Record<string, string>): AsyncChannel[] {
  return Object.entries(isNode(raw.channels) ? raw.channels : {}).flatMap(([address, value]) => {
    const ch = refs.get(value);
    if (!ch) return [];
    const publish = refs.get(ch.publish);
    const subscribe = refs.get(ch.subscribe);
    const parameters = Object.entries(isNode(ch.parameters) ? ch.parameters : {}).map(([name, p]) => {
      const param = refs.get(p);
      return { name, description: str(param?.description), schema: deref(param?.schema, refs) };
    });
    return [
      {
        id: address,
        address,
        title: str(ch["x-title"]) ?? str(publish?.summary) ?? str(subscribe?.summary),
        summary: str(publish?.summary) ?? str(subscribe?.summary),
        description: str(ch.description) ?? str(publish?.description) ?? str(subscribe?.description),
        tags: tagNames(publish?.tags, subscribe?.tags, ch.tags),
        servers: channelServers(ch.servers, servers, refs),
        parameters,
        ...wsBinding(ch, refs),
        messages: [...operationMessages(publish, "send", address, refs), ...operationMessages(subscribe, "receive", address, refs)],
        deprecated: ch.deprecated === true || publish?.deprecated === true || subscribe?.deprecated === true || undefined,
      },
    ];
  });
}

function v3(raw: Node, refs: Refs, servers: Record<string, string>): AsyncChannel[] {
  const channels = isNode(raw.channels) ? raw.channels : {};
  // Which way each of a channel's messages goes, from the operations that use it.
  const directions = new Map<string, Map<string, Set<Direction>>>();
  const opTags = new Map<string, string[]>();
  const opText = new Map<string, { title?: string; summary?: string; description?: string; deprecated?: boolean }>();
  for (const value of Object.values(isNode(raw.operations) ? raw.operations : {})) {
    const op = refs.get(value);
    const ref = isNode(op?.channel) ? op.channel.$ref : undefined;
    const channelKey = typeof ref === "string" && ref.startsWith("#/channels/") ? ref.slice("#/channels/".length).replace(/~1/g, "/").replace(/~0/g, "~") : undefined;
    if (!op || !channelKey || !(channelKey in channels)) continue;
    // `send` is the described application sending: a client receives it.
    const direction: Direction = op.action === "send" ? "receive" : op.action === "receive" ? "send" : "unspecified";
    const ch = refs.get(channels[channelKey]);
    // An operation's `messages` are `$ref`s into its channel's messages; without them, it uses them all.
    const named: string[] = Array.isArray(op.messages)
      ? op.messages.map((m: unknown) => Refs.key(m)).filter((k: string | undefined): k is string => !!k)
      : Object.keys(isNode(ch?.messages) ? ch.messages : {});
    const byMessage = directions.get(channelKey) ?? new Map<string, Set<Direction>>();
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
    if (!ch) return [];
    const address = str(ch.address) ?? key;
    const parameters = Object.entries(isNode(ch.parameters) ? ch.parameters : {}).map(([name, p]) => {
      const param = refs.get(p);
      // 3.0 parameters are strings, described by enum / default / examples rather than a schema.
      const schema: JSONSchema = { type: "string" };
      if (Array.isArray(param?.enum)) schema.enum = param.enum;
      if (param?.default !== undefined) schema.default = param.default;
      if (Array.isArray(param?.examples)) schema.examples = param.examples;
      return { name, description: str(param?.description), schema };
    });
    const byMessage = directions.get(key) ?? new Map<string, Set<Direction>>();
    const messages = Object.entries(isNode(ch.messages) ? ch.messages : {}).flatMap(([name, m]) => {
      const ways = [...(byMessage.get(name) ?? new Set<Direction>(["unspecified"]))];
      // A message used both ways is listed once for each.
      return ways.map((way) => message(m, name, way, refs)).filter((x): x is AsyncMessage => !!x);
    });
    const text = opText.get(key) ?? {};
    return [
      {
        id: key,
        address,
        title: str(ch.title) ?? text.title,
        summary: str(ch.summary) ?? text.summary,
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
export function normalizeAsyncApi(input: unknown): AsyncDoc {
  const warnings: string[] = [];
  const raw = isNode(input) ? input : {};
  const version = str(raw.asyncapi) ?? "";
  const info = isNode(raw.info) ? raw.info : {};
  const out: AsyncDoc = {
    version,
    info: { title: str(info.title) ?? "", version: str(info.version) ?? "", description: str(info.description) },
    channels: [],
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
  const refs = new Refs(raw, warnings);
  const servers: Record<string, string> = {};
  for (const [name, s] of Object.entries(isNode(raw.servers) ? raw.servers : {})) {
    const url = serverUrl(refs.get(s) ?? {});
    if (url) servers[name] = url;
  }
  out.channels = major === "2" ? v2(raw, refs, servers) : v3(raw, refs, servers);
  return out;
}
