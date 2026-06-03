import type { JSONSchema } from "@/lib/openapi";

export function ParamRow({
  name,
  schema,
  required,
  description,
  location,
  control,
}: {
  name: string;
  schema?: JSONSchema;
  required?: boolean;
  description?: string;
  location?: string;
  /** Inline input rendered on the right (turns the param doc into a form field). */
  control?: React.ReactNode;
}) {
  const typeLabel = describeType(schema);
  const enumValues = schema?.enum?.map((e) => String(e));
  const info = (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-13 font-medium" style={{ color: "#3CC88C" }}>
          {name}
        </span>
        {typeLabel && (
          <span className="font-mono text-11 text-slate-6 px-1.5 py-0.5 rounded-sm bg-slate-2">{typeLabel}</span>
        )}
        {location && (
          <span className="font-mono text-11 text-slate-6 px-1.5 py-0.5 rounded-sm bg-slate-2">{location}</span>
        )}
        {required && (
          <span className="font-mono text-11 px-1.5 py-0.5 rounded-sm" style={{ background: "rgba(225,79,79,0.12)", color: "#E14F4F" }}>
            required
          </span>
        )}
        {schema?.format && <span className="font-mono text-11 text-slate-5">· {schema.format}</span>}
      </div>
      {(description || schema?.description) && (
        <p className="text-13 text-slate-6 leading-[1.55] mt-2 mb-0">{description ?? schema?.description}</p>
      )}
      {enumValues && enumValues.length > 0 && (
        <div className="mt-2 flex gap-1.5 flex-wrap">
          <span className="font-mono text-11 text-slate-5">enum:</span>
          {enumValues.map((v) => (
            <span key={v} className="font-mono text-11 px-1.5 py-0.5 rounded-sm bg-slate-2 text-slate-6">{v}</span>
          ))}
        </div>
      )}
    </>
  );
  return (
    <div className="py-5 border-t border-slate-3">
      {control ? (
        <div className="flex gap-6 items-start param-row">
          <style>{`@media (max-width: 720px) { .param-row { flex-direction: column; } .param-row > .param-control { width: 100% !important; } }`}</style>
          <div className="flex-1 min-w-0">{info}</div>
          <div className="param-control w-[240px] shrink-0 pt-0.5">{control}</div>
        </div>
      ) : (
        info
      )}
      {schema?.type === "object" && schema.properties && <NestedObject schema={schema} />}
      {schema?.type === "array" && schema.items && <NestedArray items={schema.items} />}
    </div>
  );
}

function NestedObject({ schema }: { schema: JSONSchema }) {
  const required = new Set(schema.required ?? []);
  return (
    <details className="mt-2 group">
      <summary className="cursor-pointer text-12 text-slate-5 hover:text-ink select-none list-none">
        <span className="group-open:hidden">▸ Show child attributes</span>
        <span className="hidden group-open:inline">▾ Hide child attributes</span>
      </summary>
      <div className="mt-2 pl-4 border-l border-slate-3">
        {Object.entries(schema.properties ?? {}).map(([k, v]) => (
          <ParamRow key={k} name={k} schema={v} required={required.has(k)} />
        ))}
      </div>
    </details>
  );
}

function NestedArray({ items }: { items: JSONSchema }) {
  if (items.type !== "object" || !items.properties) return null;
  const required = new Set(items.required ?? []);
  return (
    <details className="mt-2 group">
      <summary className="cursor-pointer text-12 text-slate-5 hover:text-ink select-none list-none">
        <span className="group-open:hidden">▸ Show array item attributes</span>
        <span className="hidden group-open:inline">▾ Hide array item attributes</span>
      </summary>
      <div className="mt-2 pl-4 border-l border-slate-3">
        {Object.entries(items.properties).map(([k, v]) => (
          <ParamRow key={k} name={k} schema={v} required={required.has(k)} />
        ))}
      </div>
    </details>
  );
}

export function SchemaTable({ schema }: { schema?: JSONSchema }) {
  if (!schema) return null;
  if (schema.type === "object" && schema.properties) {
    const required = new Set(schema.required ?? []);
    return (
      <div>
        {Object.entries(schema.properties).map(([k, v]) => (
          <ParamRow key={k} name={k} schema={v} required={required.has(k)} />
        ))}
      </div>
    );
  }
  if (schema.type === "array") {
    return (
      <div>
        <ParamRow name="(array item)" schema={schema.items} />
      </div>
    );
  }
  return <ParamRow name="(value)" schema={schema} />;
}

function describeType(schema?: JSONSchema): string | null {
  if (!schema) return null;
  if (schema.enum) return "enum";
  if (schema.type === "array") {
    const inner = describeType(schema.items) ?? "any";
    return `array<${inner}>`;
  }
  if (Array.isArray(schema.type)) return schema.type.join(" | ");
  if (schema.type === "integer") return "integer";
  if (typeof schema.type === "string") return schema.type;
  if (schema.oneOf || schema.anyOf) return "oneOf";
  return "object";
}
