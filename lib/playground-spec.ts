import type { OpenAPIDoc, OpenAPIOperation, JSONSchema } from "./openapi";
import { resolveSchema, sampleFromSchema, operationHref } from "./openapi";
import { responseSampleJson } from "./openapi-samples";
import { loadConfig } from "./config";
import type { PlaygroundSpec } from "@/components/docs/api/playground";

/**
 * Builds the PlaygroundSpec consumed by the interactive playground engine
 * (components/docs/api/playground.tsx — PlaygroundProvider / usePlayground).
 * Shared by the per-operation page and the Stripe-style resource reference so
 * both drive the SAME proxy/direct send logic. PlaygroundSpec is a plain-data
 * type, so the result crosses the server→client boundary unchanged.
 */

/** Local copy of schema-table's describeType (kept here so this stays a pure lib). */
function describeType(schema?: JSONSchema): string | undefined {
  if (!schema) return undefined;
  if (schema.enum) return "enum";
  if (schema.type === "array") return `array<${describeType(schema.items) ?? "any"}>`;
  if (Array.isArray(schema.type)) return schema.type.join(" | ");
  if (schema.type === "integer") return "integer";
  if (typeof schema.type === "string") return schema.type;
  if (schema.oneOf || schema.anyOf) return "oneOf";
  return "object";
}

/** Best-effort placeholder value for a parameter input. */
export function sampleParam(schema?: JSONSchema): string {
  if (!schema) return "";
  if (schema.example !== undefined) return String(schema.example);
  if (schema.enum?.length) return String(schema.enum[0]);
  if (schema.default !== undefined) return String(schema.default);
  if (schema.type === "integer" || schema.type === "number") return "1";
  if (schema.type === "boolean") return "true";
  return "";
}

export function buildPlaygroundSpec(op: OpenAPIOperation, doc: OpenAPIDoc, root: unknown): PlaygroundSpec {
  const cfg = loadConfig();
  const servers = [...new Set([cfg.api.baseUrl, ...doc.servers.map((s) => s.url)].filter(Boolean))] as string[];
  const allSchemes = Object.values(doc.securitySchemes ?? {});
  const schemeBearer = allSchemes.some((s) => s.type === "http" && s.scheme === "bearer");
  const apiKeyHeaderNames = [
    ...new Set([
      ...op.security
        .filter((s) => s.scheme.type === "apiKey" && s.scheme.in === "header" && s.scheme.name)
        .map((s) => s.scheme.name as string),
      ...allSchemes.filter((s) => s.type === "apiKey" && s.in === "header" && s.name).map((s) => s.name as string),
    ]),
  ];
  const param = (
    p: { name: string; required?: boolean; schema?: JSONSchema; description?: string },
    reqDefault: boolean,
  ) => ({
    name: p.name,
    required: p.required ?? reqDefault,
    sample: sampleParam(p.schema),
    description: p.description,
    type: describeType(p.schema),
  });
  return {
    method: op.method,
    path: op.path,
    summary: op.summary,
    servers,
    pathParams: op.parameters.path.map((p) => param(p, true)),
    queryParams: op.parameters.query.map((p) => param(p, false)),
    headerParams: op.parameters.header.map((p) => param(p, false)),
    // Offer auth whenever the spec *defines* a bearer/apiKey scheme, even if this
    // operation under-declares its security (common in generated specs).
    bearer: schemeBearer || op.security.some((s) => s.scheme.type === "http" && s.scheme.scheme === "bearer"),
    apiKeyHeaders: apiKeyHeaderNames.map((name) => ({ name })),
    bodySample: op.requestBody?.schema
      ? JSON.stringify(sampleFromSchema(op.requestBody.schema, root), null, 2)
      : undefined,
    responses: op.responses.map((r) => ({
      status: r.status,
      body: r.example
        ? JSON.stringify(r.example, null, 2)
        : r.schema
          ? responseSampleJson(resolveSchema(r.schema, root), root)
          : "",
    })),
    endpoints: doc.tags.flatMap((t) =>
      t.operations.map((o) => ({ method: o.method, label: o.summary ?? o.operationId, href: operationHref(o) })),
    ),
    currentHref: operationHref(op),
    proxy: cfg.api.playground?.proxy ?? "auto",
  };
}
