import type { OpenAPIDoc, OpenAPIOperation, JSONSchema } from "@/lib/openapi";
import { resolveSchema, sampleFromSchema } from "@/lib/openapi";
import { curlSample, responseSampleJson } from "@/lib/openapi-samples";
import { loadConfig } from "@/lib/config";
import { MethodBadge } from "./method-badge";
import { EndpointPath } from "./endpoint-path";
import { SchemaTable, ParamRow } from "./schema-table";
import { RequestPanel, ResponsePanel } from "./code-panel";
import { Playground, type PlaygroundSpec } from "./playground";

/** Best-effort placeholder value for a parameter input. */
function sampleParam(schema?: JSONSchema): string {
  if (!schema) return "";
  if (schema.example !== undefined) return String(schema.example);
  if (schema.enum?.length) return String(schema.enum[0]);
  if (schema.default !== undefined) return String(schema.default);
  if (schema.type === "integer" || schema.type === "number") return "1";
  if (schema.type === "boolean") return "true";
  return "";
}

function buildPlaygroundSpec(op: OpenAPIOperation, doc: OpenAPIDoc, root: any): PlaygroundSpec {
  const cfg = loadConfig();
  const servers = [cfg.api.baseUrl, ...doc.servers.map((s) => s.url)].filter(Boolean) as string[];
  return {
    method: op.method,
    path: op.path,
    servers,
    pathParams: op.parameters.path.map((p) => ({
      name: p.name,
      required: p.required ?? true,
      sample: sampleParam(p.schema),
      description: p.description,
    })),
    queryParams: op.parameters.query.map((p) => ({
      name: p.name,
      required: p.required ?? false,
      sample: sampleParam(p.schema),
      description: p.description,
    })),
    headerParams: op.parameters.header.map((p) => ({
      name: p.name,
      required: p.required ?? false,
      sample: sampleParam(p.schema),
      description: p.description,
    })),
    bearer: op.security.some((s) => s.scheme.type === "http" && s.scheme.scheme === "bearer"),
    apiKeyHeaders: op.security
      .filter((s) => s.scheme.type === "apiKey" && s.scheme.in === "header" && s.scheme.name)
      .map((s) => ({ name: s.scheme.name as string })),
    bodySample: op.requestBody?.schema
      ? JSON.stringify(sampleFromSchema(op.requestBody.schema, root), null, 2)
      : undefined,
    proxy: cfg.api.playground?.proxy ?? "auto",
  };
}

type Crumb = { label: string; href?: string };

export function ApiOperationPage({
  op,
  doc,
  root,
  crumbs,
  extendedContent,
}: {
  op: OpenAPIOperation;
  doc: OpenAPIDoc;
  root: any;
  crumbs: Crumb[];
  /** Optional MDX content rendered between the endpoint path and the auto-generated parameter/body sections. */
  extendedContent?: React.ReactNode;
}) {
  const reqSchema = op.requestBody?.schema ? resolveSchema(op.requestBody.schema, root) : undefined;
  const cfg = loadConfig();
  const playgroundEnabled = cfg.api.playground?.enabled !== false;
  const playgroundSpec = playgroundEnabled ? buildPlaygroundSpec(op, doc, root) : null;

  const responseTabs = op.responses.map((r) => ({
    status: r.status,
    body: r.example
      ? JSON.stringify(r.example, null, 2)
      : r.schema
        ? responseSampleJson(resolveSchema(r.schema, root), root)
        : "",
  }));

  return (
    <>
      <main className="api-main px-12 pt-8 pb-24 api-main-pad">
        <style>{`@media (max-width: 720px) { .api-main-pad { padding-left: 20px !important; padding-right: 20px !important; } }`}</style>

        {crumbs.length > 0 && (
          <nav className="font-mono text-12 text-slate-5 mb-4">
            {crumbs.map((c, i) => (
              <span key={i}>
                {i > 0 && <span className="mx-2 text-slate-4">/</span>}
                {c.href ? (
                  <a href={c.href} className="text-slate-5 no-underline hover:text-ink">{c.label}</a>
                ) : (
                  <span className={i === crumbs.length - 1 ? "text-ink" : "text-slate-5"}>{c.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}

        <h1 className="font-semibold text-ink mb-2" style={{ fontSize: 32, letterSpacing: "-0.02em", lineHeight: 1.15 }}>
          {op.summary ?? op.operationId}
        </h1>
        {op.description && (
          <p className="text-15 leading-[1.6] text-slate-6 max-w-[60ch] mb-2">{op.description}</p>
        )}

        <EndpointPath method={op.method} path={op.path} />

        {extendedContent && <div className="docs-prose mb-6">{extendedContent}</div>}

        {op.security.length > 0 && (
          <Section id="authorizations" title="Authorizations">
            {op.security.map((s) => (
              <ParamRow
                key={s.name}
                name={describeSecurityName(s)}
                description={s.scheme.description}
                location="header"
                required
                schema={{ type: "string" }}
              />
            ))}
          </Section>
        )}

        {op.parameters.path.length > 0 && (
          <Section id="path-parameters" title="Path Parameters">
            {op.parameters.path.map((p) => (
              <ParamRow
                key={p.name}
                name={p.name}
                schema={p.schema}
                required={p.required ?? true}
                description={p.description}
              />
            ))}
          </Section>
        )}

        {op.parameters.query.length > 0 && (
          <Section id="query-parameters" title="Query Parameters">
            {op.parameters.query.map((p) => (
              <ParamRow
                key={p.name}
                name={p.name}
                schema={p.schema}
                required={p.required}
                description={p.description}
              />
            ))}
          </Section>
        )}

        {op.parameters.header.length > 0 && (
          <Section id="headers" title="Headers">
            {op.parameters.header.map((p) => (
              <ParamRow
                key={p.name}
                name={p.name}
                schema={p.schema}
                required={p.required}
                description={p.description}
              />
            ))}
          </Section>
        )}

        {reqSchema && (
          <Section id="body" title="Body">
            <p className="font-mono text-11 text-slate-5 mb-1">application/json</p>
            <SchemaTable schema={reqSchema} />
          </Section>
        )}

        <Section id="response" title="Response">
          {op.responses.map((r) => {
            const resolved = resolveSchema(r.schema, root);
            return (
              <div key={r.status} className="mb-6 last:mb-0">
                <div className="flex items-center gap-2 mb-2">
                  <StatusPill status={r.status} />
                  <span className="text-13 text-slate-6">{r.description}</span>
                </div>
                {resolved && <SchemaTable schema={resolved} />}
              </div>
            );
          })}
        </Section>
      </main>

      <aside
        className="api-side px-6 py-8 sticky self-start overflow-y-auto"
        style={{ top: 56, height: "calc(100vh - 56px)" }}
      >
        {playgroundSpec && <Playground spec={playgroundSpec} />}
        <RequestPanel
          title={op.summary ?? op.operationId}
          snippets={[{ lang: "curl", label: "cURL", code: curlSample(op, doc, root) }]}
        />
        {responseTabs.length > 0 && <ResponsePanel tabs={responseTabs} />}
      </aside>
    </>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-9">
      <h2 className="text-18 font-semibold tracking-[-0.01em] mb-3 text-ink">{title}</h2>
      <div>{children}</div>
    </section>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone = status.startsWith("2")
    ? { bg: "rgba(60,200,140,0.12)", fg: "#3CC88C" }
    : status.startsWith("4")
      ? { bg: "rgba(238,122,75,0.12)", fg: "#EE7A4B" }
      : status.startsWith("5")
        ? { bg: "rgba(225,79,79,0.12)", fg: "#E14F4F" }
        : { bg: "rgba(120,130,160,0.12)", fg: "#7882A0" };
  return (
    <span
      className="font-mono text-11 px-2 py-0.5 rounded-1 font-medium"
      style={{ background: tone.bg, color: tone.fg, border: `1px solid ${tone.fg}33` }}
    >
      {status}
    </span>
  );
}

function describeSecurityName(s: { name: string; scheme: { type: string; scheme?: string; bearerFormat?: string } }) {
  if (s.scheme.type === "http" && s.scheme.scheme === "bearer") return "Authorization";
  return s.name;
}

// Keep a reference to MethodBadge so the file participates in tree-shaking for it.
export { MethodBadge };
