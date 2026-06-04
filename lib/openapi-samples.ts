import type { OpenAPIDoc, OpenAPIOperation } from "./openapi";
import { sampleFromSchema } from "./openapi";
import { loadConfig } from "./config";

/** Build a cURL example for an operation. */
export function curlSample(op: OpenAPIOperation, doc: OpenAPIDoc, root: any): string {
  const baseUrl = loadConfig().api.baseUrl ?? doc.servers[0]?.url ?? "https://api.example.com";
  const url = baseUrl + fillPath(op.path, op.parameters.path);
  const queryStr = op.parameters.query.length
    ? "?" +
      op.parameters.query
        .filter((q) => q.required)
        .map((q) => `${q.name}=${samplePrimitive(q.schema, root)}`)
        .join("&")
    : "";

  const lines: string[] = [];
  // Long flags (--request / --url / --header / --data) get a distinct token
  // scope from the bash grammar (string.unquoted.shell), which Shiki paints
  // differently from default text — so they stand out from URLs and values.
  lines.push(`curl --request ${op.method.toUpperCase()} \\`);
  lines.push(`  --url ${shellQuote(url + queryStr)}`);

  const hasBearer = op.security.some((s) => s.scheme.type === "http" && s.scheme.scheme === "bearer");
  if (hasBearer) {
    lines[lines.length - 1] += " \\";
    lines.push(`  --header 'Authorization: Bearer <token>'`);
  }
  for (const h of op.parameters.header) {
    lines[lines.length - 1] += " \\";
    lines.push(`  --header '${h.name}: <${h.name.toLowerCase()}>'`);
  }

  if (op.requestBody?.schema) {
    lines[lines.length - 1] += " \\";
    lines.push(`  --header 'Content-Type: application/json' \\`);
    const sample = sampleFromSchema(op.requestBody.schema, root);
    const json = JSON.stringify(sample, null, 2);
    lines.push(`  --data ${shellQuote(json)}`);
  }
  return lines.join("\n");
}

function fillPath(p: string, pathParams: { name: string; schema?: any }[]) {
  return p.replace(/\{([^}]+)\}/g, (_, name) => {
    const param = pathParams.find((x) => x.name === name);
    return String(samplePrimitive(param?.schema, undefined) ?? `<${name}>`);
  });
}

function samplePrimitive(schema: any, root: any): unknown {
  if (!schema) return "<value>";
  if (schema.example !== undefined) return schema.example;
  if (schema.enum?.length) return schema.enum[0];
  if (schema.default !== undefined) return schema.default;
  if (schema.type === "integer" || schema.type === "number") return 1;
  if (schema.type === "boolean") return true;
  return "<value>";
}

function shellQuote(s: string) {
  if (!/[\s"'$`\\<>]/.test(s)) return `'${s}'`;
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export function responseSampleJson(schema: any, root: any): string {
  const sample = sampleFromSchema(schema, root);
  return JSON.stringify(sample, null, 2);
}
