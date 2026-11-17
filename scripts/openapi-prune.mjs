/**
 * Removes everything `api.hideExtensions` hides from a raw spec, so the rest of
 * the pipeline (tables, samples, Try it, events) can't publish it by accident.
 * Pure: returns a pruned copy and leaves the input alone. Plain JS so the build
 * script applies the same hiding as the pages; its types are openapi-prune.d.mts.
 *
 * It walks the document by position, so a tag, status code or schema that
 * happens to be called `default` or `example` is just a name. A flagged
 * component is deleted, along with whatever can't exist without it.
 *
 * What's left of a hidden shape: an operation whose whole request schema is
 * hidden has no body, and a response keeps its status and description without
 * one. A query or header parameter with a hidden schema goes; a path parameter
 * stays, without the schema, because the URL needs it. Object examples lose the
 * declared hidden keys. Undeclared keys, examples written as strings and
 * `x-codeSamples` aren't rewritten.
 */
const METHODS = ["get", "post", "put", "patch", "delete", "options", "head"];
const COMPONENT_SECTIONS = ["schemas", "responses", "parameters", "requestBodies", "headers", "callbacks", "pathItems"];
/** Schema keywords holding one schema, or a list of them. */
const SUBSCHEMA_KEYS = ["not", "contains", "if", "then", "else", "propertyNames"];
const STRUCTURAL_KEYS = ["type", "$ref", "properties", "items", "allOf", "anyOf", "oneOf", "enum", "const", "additionalProperties", "format"];

const isNode = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const hasProps = (s) => isNode(s.properties) && Object.keys(s.properties).length > 0;

const isNull = (s) =>
  isNode(s) && (s.type === "null" || s.const === null || (Array.isArray(s.type) && s.type.length === 1 && s.type[0] === "null"));

class Pruner {
  /** `$ref` strings of deleted components. */
  gone = new Set();
  root;
  exts;

  constructor(root, exts) {
    this.root = root;
    this.exts = exts;
    const components = isNode(root.components) ? root.components : {};
    for (const section of COMPONENT_SECTIONS) {
      for (const [name, item] of Object.entries(isNode(components[section]) ? components[section] : {})) {
        if (!this.ownFlag(item)) continue;
        // A path parameter stays, whatever it's flagged: the URL needs it.
        if (section === "parameters" && item.in === "path") continue;
        this.gone.add(`#/components/${section}/${name}`);
      }
    }
    // A schema can be left with nothing but deleted ones, which can do the same
    // to another, so this repeats until nothing changes.
    const schemas = isNode(components.schemas) ? components.schemas : {};
    for (let changed = true; changed;) {
      changed = false;
      for (const [name, schema] of Object.entries(schemas)) {
        const ref = `#/components/schemas/${name}`;
        if (this.gone.has(ref) || !this.schemaGone(schema)) continue;
        this.gone.add(ref);
        changed = true;
      }
    }
  }

  ownFlag(node) {
    return isNode(node) && this.exts.some((e) => !!node[e]);
  }

  /** The node a `$ref` points at, through chains; undefined when it's a cycle or missing. */
  resolve(node, seen = new Set()) {
    if (!isNode(node) || typeof node.$ref !== "string") return node;
    if (seen.has(node.$ref)) return undefined;
    seen.add(node.$ref);
    let cur = this.root;
    for (const part of node.$ref.replace(/^#\//, "").split("/")) cur = isNode(cur) ? cur[part] : undefined;
    return this.resolve(cur, seen);
  }

  /** Flagged, or a reference to something deleted or flagged. */
  refGone(node) {
    if (!isNode(node)) return false;
    if (this.ownFlag(node)) return true;
    if (typeof node.$ref !== "string") return false;
    return this.gone.has(node.$ref) || this.ownFlag(this.resolve(node));
  }

  /** Whether nothing visible would be left of this schema. Follows `$ref`s only through `gone`. */
  schemaGone(s) {
    if (!isNode(s)) return false;
    if (this.refGone(s)) return true;
    const types = Array.isArray(s.type) ? s.type : [s.type];
    if (types.includes("array") && this.schemaGone(s.items)) return true;
    for (const key of ["anyOf", "oneOf"]) {
      const real = Array.isArray(s[key]) ? s[key].filter((m) => !isNull(m)) : [];
      if (real.length && real.every((m) => this.schemaGone(m))) return true;
    }
    if (hasProps(s)) return false;
    // `allOf: [Hidden, { nullable: true, description }]`: only the parts with a shape count.
    const parts = Array.isArray(s.allOf) ? s.allOf.filter((p) => isNode(p) && STRUCTURAL_KEYS.some((k) => k in p)) : [];
    if (parts.length && parts.every((p) => this.schemaGone(p))) return true;
    return !parts.length && isNode(s.additionalProperties) && this.schemaGone(s.additionalProperties);
  }

  /** Remove hidden keys from an example, by the original schema. Non-objects pass through. */
  cleanExample(value, schema, depth = 0) {
    const s = this.resolve(schema);
    if (!isNode(s) || depth > 32) return value;
    if (Array.isArray(value)) return value.map((v) => this.cleanExample(v, s.items, depth + 1));
    if (!isNode(value)) return value;
    let out = { ...value };
    for (const key of ["allOf", "anyOf", "oneOf"]) {
      for (const m of Array.isArray(s[key]) ? s[key] : []) {
        if (this.schemaGone(m)) {
          const props = this.resolve(m)?.properties;
          for (const name of Object.keys(isNode(props) ? props : {})) delete out[name];
        } else {
          out = this.cleanExample(out, m, depth + 1);
        }
      }
    }
    const props = isNode(s.properties) ? s.properties : {};
    for (const [k, v] of Object.entries(out)) {
      const declared = Object.prototype.hasOwnProperty.call(props, k);
      const sub = declared ? props[k] : s.additionalProperties;
      if (!isNode(sub)) continue;
      if (this.schemaGone(sub)) delete out[k];
      else out[k] = this.cleanExample(v, sub, depth + 1);
    }
    return out;
  }

  /** The visible part of a schema that isn't itself gone. */
  schema(s) {
    if (!isNode(s)) return s;
    const out = { ...s };
    if (isNode(s.properties)) {
      const props = {};
      const dropped = new Set();
      for (const [name, sub] of Object.entries(s.properties)) {
        if (this.schemaGone(sub)) dropped.add(name);
        else props[name] = this.schema(sub);
      }
      out.properties = props;
      if (dropped.size && Array.isArray(s.required)) out.required = s.required.filter((r) => !dropped.has(r));
    }
    if (isNode(s.patternProperties)) {
      out.patternProperties = Object.fromEntries(
        Object.entries(s.patternProperties).filter(([, v]) => !this.schemaGone(v)).map(([k, v]) => [k, this.schema(v)]),
      );
    }
    if ("items" in s) {
      if (this.schemaGone(s.items)) delete out.items;
      else out.items = this.schema(s.items);
    }
    if (isNode(s.additionalProperties)) {
      if (this.schemaGone(s.additionalProperties)) delete out.additionalProperties;
      else out.additionalProperties = this.schema(s.additionalProperties);
    }
    for (const key of ["allOf", "anyOf", "oneOf", "prefixItems"]) {
      if (!Array.isArray(s[key])) continue;
      out[key] = s[key].filter((m) => !this.schemaGone(m)).map((m) => this.schema(m));
      if (key === "allOf" && !out[key].length) delete out[key];
    }
    for (const key of SUBSCHEMA_KEYS) if (isNode(s[key])) out[key] = this.schema(s[key]);
    if (isNode(s.discriminator?.mapping)) {
      out.discriminator = {
        ...s.discriminator,
        mapping: Object.fromEntries(Object.entries(s.discriminator.mapping).filter(([, ref]) => !this.gone.has(String(ref)))),
      };
    }
    if ("example" in s) out.example = this.cleanExample(s.example, s);
    if (Array.isArray(s.examples)) out.examples = s.examples.map((e) => this.cleanExample(e, s));
    if ("default" in s) out.default = this.cleanExample(s.default, s);
    return out;
  }

  /** A `content` map, without media types whose whole schema is hidden. */
  content(content) {
    if (!isNode(content)) return undefined;
    const out = {};
    for (const [type, media] of Object.entries(content)) {
      if (!isNode(media)) {
        out[type] = media;
        continue;
      }
      if (this.schemaGone(media.schema)) continue;
      const m = { ...media };
      if ("schema" in media) m.schema = this.schema(media.schema);
      if ("example" in media) m.example = this.cleanExample(media.example, media.schema);
      if (isNode(media.examples)) {
        m.examples = Object.fromEntries(
          Object.entries(media.examples).map(([name, ex]) => [
            name,
            isNode(ex) && "value" in ex ? { ...ex, value: this.cleanExample(ex.value, media.schema) } : ex,
          ]),
        );
      }
      if (isNode(media.encoding)) {
        const props = this.resolve(media.schema)?.properties;
        m.encoding = Object.fromEntries(
          Object.entries(media.encoding).filter(([field]) => !(isNode(props) && this.schemaGone(props[field]))),
        );
      }
      out[type] = m;
    }
    return out;
  }

  body(item) {
    if (!isNode(item) || !("content" in item)) return item;
    return { ...item, content: this.content(item.content) };
  }

  response(item) {
    if (!isNode(item)) return item;
    const out = { ...item };
    if ("content" in item) out.content = this.content(item.content);
    if (isNode(item.headers)) {
      out.headers = Object.fromEntries(
        Object.entries(item.headers)
          .filter(([, h]) => !this.refGone(h) && !this.schemaGone(this.resolve(h)?.schema))
          .map(([name, h]) => [name, this.parameter(h)]),
      );
    }
    return out;
  }

  parameter(p) {
    if (!isNode(p) || typeof p.$ref === "string") return p;
    const out = { ...p };
    if (this.schemaGone(p.schema)) delete out.schema;
    else if ("schema" in p) out.schema = this.schema(p.schema);
    if ("example" in p) out.example = this.cleanExample(p.example, p.schema);
    if ("content" in p) out.content = this.content(p.content);
    return out;
  }

  parameters(list) {
    if (!Array.isArray(list)) return list;
    return list
      .filter((p) => {
        const target = this.resolve(p);
        if (target?.in === "path") return true;
        return !this.refGone(p) && !this.ownFlag(target) && !this.schemaGone(target?.schema);
      })
      .map((p) => this.parameter(p));
  }

  /** `x-events` as a `name → definition` map; a list of bare names has nothing to clean. */
  events(events) {
    if (!isNode(events)) return events;
    return Object.fromEntries(
      Object.entries(events)
        .filter(([, e]) => !this.ownFlag(e))
        .map(([name, e]) => {
          if (!isNode(e)) return [name, e];
          const out = { ...e };
          for (const key of ["payload", "schema"]) {
            if (!(key in e)) continue;
            if (this.schemaGone(e[key])) delete out[key];
            else out[key] = this.schema(e[key]);
          }
          if ("requestBody" in e) out.requestBody = this.body(e.requestBody);
          return [name, out];
        }),
    );
  }

  operation(op) {
    if (!isNode(op)) return op;
    const out = { ...op };
    if ("parameters" in op) out.parameters = this.parameters(op.parameters);
    if (isNode(op.requestBody)) {
      const body = this.body(op.requestBody);
      // Every media type hidden means there's no body left to document.
      if (isNode(body.content) && !Object.keys(body.content).length) delete out.requestBody;
      else out.requestBody = body;
    }
    if (isNode(op.responses)) {
      out.responses = Object.fromEntries(Object.entries(op.responses).map(([status, r]) => [status, this.response(r)]));
    }
    if (isNode(op.callbacks)) {
      // A callback flagged itself (or by its $ref's target) goes, as a flagged path
      // item does; one left with no path items would still list as an event.
      out.callbacks = Object.fromEntries(
        Object.entries(op.callbacks)
          .filter(([, cb]) => {
            if (this.refGone(cb)) return false;
            // A $ref to a callback component whose path items are all hidden is as empty.
            const target = typeof cb?.$ref === "string" ? this.resolve(cb) : undefined;
            return !isNode(target) || Object.keys(this.pathItems(target)).length > 0;
          })
          .map(([name, cb]) => [name, isNode(cb) && typeof cb.$ref !== "string" ? this.pathItems(cb) : cb])
          .filter(([, cb]) => !isNode(cb) || Object.keys(cb).length > 0),
      );
    }
    if ("x-events" in op) out["x-events"] = this.events(op["x-events"]);
    return out;
  }

  /** A `paths`-shaped map, without hidden path items and the operations in them. */
  pathItems(items) {
    const out = {};
    for (const [key, item] of Object.entries(isNode(items) ? items : {})) {
      if (this.refGone(item)) continue;
      if (!isNode(item)) {
        out[key] = item;
        continue;
      }
      const kept = { ...item };
      for (const m of METHODS) {
        if (!isNode(item[m])) continue;
        if (this.ownFlag(item[m])) delete kept[m];
        else kept[m] = this.operation(item[m]);
      }
      // A webhook or callback whose every operation was hidden goes with them.
      if (METHODS.some((m) => isNode(item[m])) && !METHODS.some((m) => isNode(kept[m]))) continue;
      if ("parameters" in item) kept.parameters = this.parameters(item.parameters);
      out[key] = kept;
    }
    return out;
  }

  section(items, section, each) {
    return Object.fromEntries(
      Object.entries(isNode(items) ? items : {})
        .filter(([name]) => !this.gone.has(`#/components/${section}/${name}`))
        .map(([name, item]) => [name, each(item)]),
    );
  }

  document() {
    const raw = this.root;
    const out = { ...raw };
    for (const key of ["paths", "webhooks", "x-webhooks"]) if (isNode(raw[key])) out[key] = this.pathItems(raw[key]);
    if (Array.isArray(raw.tags)) {
      out.tags = raw.tags.map((t) => (isNode(t) && "x-events" in t ? { ...t, "x-events": this.events(t["x-events"]) } : t));
    }
    if (isNode(raw.components)) {
      const c = { ...raw.components };
      const each = {
        schemas: (s) => this.schema(s),
        responses: (r) => this.response(r),
        parameters: (p) => this.parameter(p),
        requestBodies: (b) => this.body(b),
        headers: (h) => this.parameter(h),
        callbacks: (cb) => (isNode(cb) ? this.pathItems(cb) : cb),
        pathItems: (item) => (isNode(item) ? this.pathItems({ item }).item : item),
      };
      for (const section of COMPONENT_SECTIONS) {
        if (isNode(c[section])) c[section] = this.section(c[section], section, each[section]);
      }
      out.components = c;
    }
    return out;
  }
}

export function pruneSpec (raw, hideExtensions) {
  if (!hideExtensions.length || !isNode(raw)) return raw;
  return new Pruner(raw, hideExtensions).document();
}

/**
 * One schema's visible part, for a schema with no `$ref`s left (AsyncAPI's are
 * resolved when read): hidden properties and members dropped, its own examples
 * cleaned. Undefined when nothing of it is visible.
 */
export function pruneSchema (schema, hideExtensions) {
  if (!hideExtensions.length || !isNode(schema)) return schema;
  const pruner = new Pruner({}, hideExtensions);
  return pruner.schemaGone(schema) ? undefined : (pruner.schema(schema));
}

/** An example without the keys `schema` (no `$ref`s left) declares hidden. */
export function pruneExample(value, schema, hideExtensions) {
  if (!hideExtensions.length) return value;
  return new Pruner({}, hideExtensions).cleanExample(value, schema);
}
