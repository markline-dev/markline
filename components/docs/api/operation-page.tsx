import type { OpenAPIDoc, OpenAPIOperation } from "@/lib/openapi";
import { resolveSchema } from "@/lib/openapi";
import { curlSample, responseSampleJson } from "@/lib/openapi-samples";
import { loadConfig, playgroundMode } from "@/lib/config";
import { buildPlaygroundSpec, sampleParam } from "@/lib/playground-spec";
import { MethodBadge } from "./method-badge";
import { EndpointPath } from "./endpoint-path";
import { SchemaTable, ParamRow } from "./schema-table";
import { RequestPanel, ResponsePanel } from "./code-panel";
import {
  PlaygroundProvider, RequestConsole, ParamInput, AuthInput, BodyEditor,
} from "./playground";

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
  const mode = playgroundMode(cfg.api);
  const playgroundSpec = mode !== "off" ? buildPlaygroundSpec(op, doc, root) : null;
  const interactive = !!playgroundSpec;
  const showInline = mode === "full" || mode === "inline"; // editable inputs in the param docs
  const showExplorer = mode === "full" || mode === "explorer"; // the API Explorer modal

  const responseTabs = op.responses.map((r) => ({
    status: r.status,
    body: r.example
      ? JSON.stringify(r.example, null, 2)
      : r.schema
        ? responseSampleJson(resolveSchema(r.schema, root), root)
        : "",
  }));

  const page = (
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

        {playgroundSpec ? (
          (playgroundSpec.bearer || playgroundSpec.apiKeyHeaders.length > 0) && (
            <Section id="authorizations" title="Authorizations">
              {playgroundSpec.bearer && (
                <ParamRow
                  name="Authorization"
                  description="Bearer authentication header of the form `Bearer <token>`."
                  location="header"
                  required
                  schema={{ type: "string" }}
                  control={showInline ? <AuthInput /> : undefined}
                />
              )}
              {playgroundSpec.apiKeyHeaders.map((ak) => (
                <ParamRow
                  key={ak.name}
                  name={ak.name}
                  location="header"
                  required
                  schema={{ type: "string" }}
                  control={showInline ? <ParamInput location="header" name={ak.name} /> : undefined}
                />
              ))}
            </Section>
          )
        ) : (
          op.security.length > 0 && (
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
          )
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
                control={showInline ? <ParamInput location="path" name={p.name} sample={sampleParam(p.schema)} /> : undefined}
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
                control={showInline ? <ParamInput location="query" name={p.name} sample={sampleParam(p.schema)} /> : undefined}
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
                control={showInline ? <ParamInput location="header" name={p.name} sample={sampleParam(p.schema)} /> : undefined}
              />
            ))}
          </Section>
        )}

        {reqSchema && (
          <Section id="body" title="Body">
            <p className="font-mono text-11 text-slate-5 mb-1">application/json</p>
            {showInline && <BodyEditor />}
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
        {interactive ? (
          <RequestConsole explorer={showExplorer} />
        ) : (
          <RequestPanel
            title={op.summary ?? op.operationId}
            snippets={[{ lang: "curl", label: "cURL", code: curlSample(op, doc, root) }]}
          />
        )}
        {responseTabs.some((t) => t.body.trim() !== "") && <ResponsePanel tabs={responseTabs} />}
      </aside>
    </>
  );

  return playgroundSpec ? <PlaygroundProvider spec={playgroundSpec}>{page}</PlaygroundProvider> : page;
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
