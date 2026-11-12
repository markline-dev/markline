import type { OpenAPIDoc, OpenAPIOperation } from "./openapi";
import { resolveSchema, sampleFromSchema } from "./openapi";
import { bodyKind, flattenObject, isBinarySchema } from "./openapi-media";
import { formFieldArg, formFileArg, formText, sampleUrl } from "./openapi-curl";
import { loadConfig } from "./config";

/** Header names the operation authenticates with through an API key. */
export function apiKeyHeaders(op: OpenAPIOperation): string[] {
  const names = op.security.flatMap((s) => (s.scheme.type === "apiKey" && s.scheme.in === "header" && s.scheme.name ? [s.scheme.name] : []));
  return [...new Set(names)];
}

/** Build a cURL example for an operation. */
export function curlSample(op: OpenAPIOperation, doc: OpenAPIDoc, root: any): string {
  const baseUrl = loadConfig().api.baseUrl ?? doc.servers[0]?.url ?? "https://api.example.com";
  const url = sampleUrl(
    baseUrl,
    op.path,
    (name) => samplePrimitive(op.parameters.path.find((x) => x.name === name)?.schema, undefined),
    op.parameters.query.filter((q) => q.required).map((q) => ({ name: q.name, value: samplePrimitive(q.schema, root) })),
  );

  const lines: string[] = [];
  // Long flags (--request / --url / --header / --data) get a distinct token
  // scope from the bash grammar (string.unquoted.shell), which Shiki paints
  // differently from default text — so they stand out from URLs and values.
  lines.push(`curl --request ${op.method.toUpperCase()} \\`);
  lines.push(`  --url ${shellQuote(url)}`);

  const hasBearer = op.security.some((s) => s.scheme.type === "http" && s.scheme.scheme === "bearer");
  if (hasBearer) {
    lines[lines.length - 1] += " \\";
    lines.push(`  --header 'Authorization: Bearer <token>'`);
  }
  const keyHeaders = apiKeyHeaders(op);
  for (const name of keyHeaders) {
    lines[lines.length - 1] += " \\";
    lines.push(`  --header ${shellQuote(`${name}: <api-key>`)}`);
  }
  for (const h of op.parameters.header ?? []) {
    if (keyHeaders.some((k) => k.toLowerCase() === h.name.toLowerCase())) continue;
    lines[lines.length - 1] += " \\";
    lines.push(`  --header ${shellQuote(`${h.name}: <${h.name.toLowerCase()}>`)}`);
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
      const flat = flattenObject(schema);
      const required = new Set(flat?.required ?? []);
      const props = Object.entries(flat?.properties ?? {});
      let wrote = false;
      for (const [name, prop] of props) {
        const file = isBinarySchema(prop);
        if (!required.has(name) && !file) continue;
        const arg = file ? formFileArg(name, `path/to/${name}`) : formFieldArg(kind, name, sampleFromSchema(prop, root));
        push(`  --${arg.flag} ${arg.word}`);
        wrote = true;
      }
      // Always send a body: without one curl would make this a GET's shape.
      if (!wrote) {
        const arg = formFieldArg(kind, props[0]?.[0] ?? "field", "value");
        push(`  --${arg.flag} ${arg.word}`);
      }
    } else if (kind === "other" && isBinarySchema(schema)) {
      push(`  --header ${shellQuote(`Content-Type: ${ct}`)}`);
      push(`  --data-binary @path/to/file`);
    } else {
      push(`  --header ${shellQuote(`Content-Type: ${ct}`)}`);
      const sample = sampleFromSchema(op.requestBody.schema, root);
      if (kind === "json") push(`  --data ${shellQuote(JSON.stringify(sample, null, 2))}`);
      else push(`  --data-raw ${shellQuote(typeof sample === "string" ? sample : /[/+]xml\b/i.test(ct) ? "<example/>" : formText(sample))}`);
    }
  }
  return lines.join("\n");
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
