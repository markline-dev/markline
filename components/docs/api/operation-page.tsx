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
  base = "/api-reference",
}: {
  op: OpenAPIOperation;
  doc: OpenAPIDoc;
  root: any;
  crumbs: Crumb[];
  /** Optional MDX content rendered between the endpoint path and the auto-generated parameter/body sections. */
  extendedContent?: React.ReactNode;
  /** Route base for the explorer's endpoint switcher ("/api-reference[/<id>]"). */
  base?: string;
}) {
  const reqSchema = op.requestBody?.schema ? resolveSchema(op.requestBody.schema, root) : undefined;
  const cfg = loadConfig();
  const mode = playgroundMode(cfg.api);
  const playgroundSpec = mode !== "off" ? buildPlaygroundSpec(op, doc, root, base) : null;
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
    <div className="api-op-shell">
      <main className="api-op-main">
        {crumbs.length > 0 && (
          <nav className="api-crumbs">
            {crumbs.map((c, i) => (
              <span key={i}>
                {i > 0 && <span className="sep">/</span>}
                {c.href ? (
                  <a href={c.href}>{c.label}</a>
                ) : (
                  <span className={i === crumbs.length - 1 ? "cur" : undefined}>{c.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}

        <h1 className="api-title">{op.summary ?? op.operationId}</h1>
        {op.description && <p className="api-desc">{op.description}</p>}

        <EndpointPath method={op.method} path={op.path} />

        {extendedContent && <div className="docs-prose api-op-extended">{extendedContent}</div>}

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
            <p className="api-body-type">application/json</p>
            {showInline && <BodyEditor />}
            <SchemaTable schema={reqSchema} />
          </Section>
        )}

        <Section id="response" title="Response">
          {op.responses.map((r) => {
            const resolved = resolveSchema(r.schema, root);
            return (
              <div key={r.status} className="api-resp-row">
                <div className="api-resp-head">
                  <StatusPill status={r.status} />
                  <span className="desc">{r.description}</span>
                </div>
                {resolved && <SchemaTable schema={resolved} />}
              </div>
            );
          })}
        </Section>
      </main>

      <aside className="api-op-side">
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
    </div>
  );

  return playgroundSpec ? <PlaygroundProvider spec={playgroundSpec}>{page}</PlaygroundProvider> : page;
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="api-section">
      <h2>{title}</h2>
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
    <span className="status-pill" style={{ background: tone.bg, color: tone.fg, borderColor: `${tone.fg}33` }}>
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
