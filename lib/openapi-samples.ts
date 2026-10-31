import type { OpenAPIDoc, OpenAPIOperation } from "./openapi";
import { resolveSchema, sampleFromSchema } from "./openapi";
import { bodyKind, isBinarySchema } from "./openapi-media";
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
  const keyHeaders = [
    ...new Set(
      op.security
        .filter((s) => s.scheme.type === "apiKey" && s.scheme.in === "header" && s.scheme.name)
        .map((s) => s.scheme.name as string),
    ),
  ];
  for (const name of keyHeaders) {
    lines[lines.length - 1] += " \\";
    lines.push(`  --header '${name}: <api-key>'`);
  }
  for (const h of op.parameters.header) {
    if (keyHeaders.some((k) => k.toLowerCase() === h.name.toLowerCase())) continue;
    lines[lines.length - 1] += " \\";
    lines.push(`  --header '${h.name}: <${h.name.toLowerCase()}>'`);
  }

  if (op.requestBody?.schema) {
    const ct = op.requestBody.contentType ?? "application/json";
    const kind = bodyKind(ct);
    const schema = resolveSchema(op.requestBody.schema, root);
    const push = (l: string) => {
      lines[lines.length - 1] += " \\";
      lines.push(l);
    };
    if (kind === "multipart" || kind === "form") {
      // curl writes the Content-Type itself (with the multipart boundary).
      const required = new Set(schema?.required ?? []);
      for (const [name, prop] of Object.entries(schema?.properties ?? {})) {
        const file = isBinarySchema(prop);
        if (!required.has(name) && !file) continue;
        if (kind === "multipart") {
          push(`  --form ${shellQuote(file ? `${name}=@path/to/${name}` : `${name}=${formValue(sampleFromSchema(prop, root))}`)}`);
        } else {
          push(`  --data-urlencode ${shellQuote(`${name}=${formValue(sampleFromSchema(prop, root))}`)}`);
        }
      }
    } else if (kind === "other" && isBinarySchema(schema)) {
      push(`  --header 'Content-Type: ${ct}'`);
      push(`  --data-binary @path/to/file`);
    } else {
      push(`  --header 'Content-Type: ${ct}'`);
      const sample = sampleFromSchema(op.requestBody.schema, root);
      push(`  --data ${shellQuote(kind === "json" ? JSON.stringify(sample, null, 2) : formValue(sample))}`);
    }
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

function formValue(v: unknown): string {
  return v !== null && typeof v === "object" ? JSON.stringify(v) : String(v);
}

function shellQuote(s: string) {
  if (!/[\s"'$`\\<>]/.test(s)) return `'${s}'`;
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export function responseSampleJson(schema: any, root: any): string {
  const sample = sampleFromSchema(schema, root);
  return JSON.stringify(sample, null, 2);
}
