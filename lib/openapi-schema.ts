/**
 * Schema → field rows for the API reference tables.
 *
 * Generated specs (Pydantic/FastAPI, OpenAPI 3.1) write an optional field as
 * `anyOf: [X, {type: "null"}]` and wrap `$ref`s in a one-member `allOf`. Both
 * should read as plain X, marked nullable, with X's own fields underneath.
 * Pure: takes schemas whose `$ref`s are already resolved, and which
 * lib/openapi-prune.ts has already stripped of hidden fields.
 */
import type { JSONSchema } from "./openapi";

export type FieldView = {
  name: string;
  type: string;
  required?: boolean;
  optional?: boolean;
  nullable?: boolean;
  deprecated?: boolean;
  description?: string;
  enums?: string[];
  /** Fields of an object (or of an array's object items). */
  children?: FieldView[];
  /** The object members of a real union, each with its own fields. */
  variants?: { label: string; fields: FieldView[] }[];
};

export type FieldOptions = {
  /** Nesting levels shown below the top-level fields. Default 3. */
  depth?: number;
};

function isNullSchema(s: JSONSchema | undefined): boolean {
  if (!s) return false;
  if (s.type === "null" || s.const === null) return true;
  if (Array.isArray(s.type) && s.type.length === 1 && s.type[0] === "null") return true;
  return Array.isArray(s.enum) && s.enum.length === 1 && s.enum[0] === null && !s.type;
}

/** Overlay a wrapper's own keys (description, default, title…) on its single member. */
function mergeInto(member: JSONSchema, outer: JSONSchema, drop: "anyOf" | "oneOf" | "allOf"): JSONSchema {
  const { [drop]: _drop, ...rest } = outer;
  return { ...member, ...rest };
}

/**
 * Strip null out of a schema: `type: [X, "null"]`, `nullable: true` (3.0), an
 * `anyOf`/`oneOf` with a null member, and a one-member `allOf` wrapper. A union
 * left with a single member collapses into it. Returns the non-null schema.
 */
export function collapseNullable(schema: JSONSchema): { schema: JSONSchema; nullable: boolean } {
  let s = schema;
  let nullable = s.nullable === true;
  for (let guard = 0; guard < 8; guard++) {
    if (Array.isArray(s.type) && s.type.includes("null")) {
      const types = s.type.filter((t) => t !== "null");
      // `type: ["null"]` is the null type itself, not a nullable something.
      if (!types.length) return { schema: { ...s, type: "null" }, nullable: false };
      nullable = true;
      s = { ...s, type: types.length === 1 ? types[0] : types };
      continue;
    }
    let changed = false;
    for (const key of ["anyOf", "oneOf"] as const) {
      const members = s[key];
      if (!Array.isArray(members)) continue;
      const rest = members.filter((m) => !isNullSchema(m));
      if (rest.length === members.length && rest.length !== 1) continue;
      if (rest.length < members.length) nullable = true;
      s = rest.length === 1 ? mergeInto(rest[0], s, key) : { ...s, [key]: rest };
      changed = rest.length === 1 || rest.length < members.length;
      break;
    }
    if (!changed && Array.isArray(s.allOf) && s.allOf.length === 1 && !s.properties) {
      s = mergeInto(s.allOf[0], s, "allOf");
      changed = true;
    }
    if (!changed) break;
    if (s.nullable === true) nullable = true;
  }
  return { schema: s, nullable };
}

/** Merge an `allOf` into one object schema; `nullable` if any part is. */
function mergeAllOf(s: JSONSchema): { schema: JSONSchema; nullable: boolean } {
  if (!Array.isArray(s.allOf) || !s.allOf.length) return { schema: s, nullable: false };
  const out: JSONSchema = { ...s, required: [...(s.required ?? [])] };
  delete out.allOf;
  const own = s.properties ?? {};
  const props: Record<string, JSONSchema> = {};
  let nullable = false;
  for (const part of s.allOf) {
    const c = collapseNullable(part);
    const m = mergeAllOf(c.schema);
    nullable = nullable || c.nullable || m.nullable;
    Object.assign(props, m.schema.properties ?? {});
    out.required!.push(...(m.schema.required ?? []));
    if (!out.type && m.schema.type) out.type = m.schema.type;
    if (out.description === undefined && m.schema.description) out.description = m.schema.description;
    if (out.enum === undefined && m.schema.enum) out.enum = m.schema.enum;
  }
  // The wrapper's own fields are the more specific ones.
  if (Object.keys(props).length || Object.keys(own).length) out.properties = { ...props, ...own };
  return { schema: out, nullable };
}

/** The schema a field row describes: null stripped, `allOf` merged. */
export function normalizeField(schema: JSONSchema | undefined): { schema: JSONSchema; nullable: boolean } {
  if (!schema) return { schema: {}, nullable: false };
  const { schema: s, nullable } = collapseNullable(schema);
  const merged = mergeAllOf(s);
  return { schema: merged.schema, nullable: nullable || merged.nullable };
}

function unionMembers(s: JSONSchema): JSONSchema[] | undefined {
  return Array.isArray(s.oneOf) ? s.oneOf : Array.isArray(s.anyOf) ? s.anyOf : undefined;
}

/** Short label for a union member: its type, or an object's title. */
function memberLabel(m: JSONSchema): string {
  const { schema } = normalizeField(m);
  if ((schema.type === "object" || schema.properties) && typeof schema.title === "string") return schema.title;
  return typeLabel(schema);
}

/** Type label for a field ("string", "array<object>", "string | integer"). Null is
 *  stripped; whether the field is nullable is reported separately. */
export function typeLabel(schema: JSONSchema | undefined): string {
  if (!schema) return "any";
  const { schema: s } = normalizeField(schema);
  if (s.enum) return "enum";
  if (s.const !== undefined) return "const";
  if (s.type === "array") return `array<${typeLabel(s.items)}>`;
  if (Array.isArray(s.type)) return s.type.join(" | ");
  if (typeof s.type === "string") return s.type;
  const members = unionMembers(s);
  if (members?.length) return [...new Set(members.map(memberLabel))].join(" | ");
  if (s.properties || s.additionalProperties) return "object";
  return "any";
}

/** The object whose fields sit under a field: itself, or its array items. */
function objectBody(s: JSONSchema): JSONSchema | undefined {
  if (s.properties) return s;
  if (s.type === "array" && s.items) {
    const items = normalizeField(s.items).schema;
    return items.properties ? items : undefined;
  }
  return undefined;
}

/**
 * Field rows for an object schema's properties, with nested children (objects,
 * arrays of objects) and union variants down to `depth` levels.
 */
export function schemaFields(schema: JSONSchema | undefined, opts: FieldOptions = {}, level = 0): FieldView[] {
  if (!schema) return [];
  const body = normalizeField(schema).schema;
  if (!body.properties) return [];
  const depth = opts.depth ?? 3;
  const required = new Set(body.required ?? []);
  const out: FieldView[] = [];
  for (const [name, raw] of Object.entries(body.properties)) {
    if (!raw) continue;
    const { schema: s, nullable } = normalizeField(raw);
    const field: FieldView = {
      name,
      type: typeLabel(s),
      required: required.has(name),
      optional: !required.has(name),
      description: (raw.description as string | undefined) ?? s.description,
      enums: (s.type === "array" ? normalizeField(s.items).schema.enum : s.enum)
        ?.filter((e) => e !== null)
        .map((e) => String(e)),
    };
    if (nullable) field.nullable = true;
    if (raw.deprecated === true || s.deprecated === true) field.deprecated = true;
    if (level < depth) {
      const obj = objectBody(s);
      if (obj) {
        const children = schemaFields(obj, opts, level + 1);
        if (children.length) field.children = children;
      } else {
        // A union directly on the field, or on the items of an array field.
        const members = unionMembers(s.type === "array" ? normalizeField(s.items).schema : s);
        const variants = (members ?? [])
          .map((m) => {
            const ms = normalizeField(m).schema;
            const mo = objectBody(ms);
            return mo ? { label: memberLabel(m), fields: schemaFields(mo, opts, level + 1) } : undefined;
          })
          .filter((v): v is { label: string; fields: FieldView[] } => !!v && v.fields.length > 0);
        if (variants.length) field.variants = variants;
      }
    }
    out.push(field);
  }
  return out;
}

/** Deprecated on the parameter itself, on its schema, or on what's left of a union. */
export function isDeprecatedParam(paramDeprecated: unknown, raw: JSONSchema | undefined, shape: JSONSchema): boolean {
  return paramDeprecated === true || raw?.deprecated === true || shape.deprecated === true;
}

/** A path/query parameter's field row. Pass the schema already resolved. */
export function paramField(
  p: { name: string; description?: string; deprecated?: boolean; schema?: JSONSchema },
  required: boolean,
): FieldView {
  const { schema: s, nullable } = normalizeField(p.schema);
  const field: FieldView = {
    name: p.name,
    type: typeLabel(p.schema),
    required,
    optional: !required,
    description: p.description ?? s.description,
    enums: s.enum?.filter((e) => e !== null).map((e) => String(e)),
  };
  if (nullable) field.nullable = true;
  if (isDeprecatedParam(p.deprecated, p.schema, s)) field.deprecated = true;
  return field;
}

/** First non-null member of a union, for sample values. */
export function sampleMember(members: JSONSchema[] | undefined): JSONSchema | undefined {
  return members?.find((m) => !isNullSchema(m)) ?? members?.[0];
}
