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
      <div className="ml-param-head">
        <span className="ml-param-name">{name}</span>
        {typeLabel && <span className="ml-param-tag">{typeLabel}</span>}
        {location && <span className="ml-param-tag">{location}</span>}
        {required && <span className="ml-param-required">required</span>}
        {schema?.format && <span className="ml-param-fmt">· {schema.format}</span>}
      </div>
      {(description || schema?.description) && (
        <p className="ml-param-desc">{description ?? schema?.description}</p>
      )}
      {enumValues && enumValues.length > 0 && (
        <div className="ml-param-enum">
          <span className="lbl">enum:</span>
          {enumValues.map((v) => (
            <span key={v} className="val">{v}</span>
          ))}
        </div>
      )}
    </>
  );
  return (
    <div className="ml-param">
      {control ? (
        <div className="ml-param-row">
          <div className="ml-param-info">{info}</div>
          <div className="ml-param-control">{control}</div>
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
    <details className="ml-param-nested">
      <summary>
        <span className="closed-lbl">▸ Show child attributes</span>
        <span className="open-lbl">▾ Hide child attributes</span>
      </summary>
      <div className="ml-param-nested-body">
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
    <details className="ml-param-nested">
      <summary>
        <span className="closed-lbl">▸ Show array item attributes</span>
        <span className="open-lbl">▾ Hide array item attributes</span>
      </summary>
      <div className="ml-param-nested-body">
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

export function describeType(schema?: JSONSchema): string | null {
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
