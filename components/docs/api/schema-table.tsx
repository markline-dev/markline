import type { JSONSchema } from "@/lib/openapi";
import { mdToHtml } from "@/lib/md-desc";
import { normalizeField, typeLabel } from "@/lib/openapi-schema";

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
  // `anyOf: [X, null]` reads as X, marked nullable.
  const { schema: shape, nullable } = normalizeField(schema);
  const typeText = describeType(schema);
  const enumValues = shape.enum?.filter((e) => e !== null).map((e) => String(e));
  const deprecated = schema?.deprecated === true || shape.deprecated === true;
  const info = (
    <>
      <div className="ml-param-head">
        <span className="ml-param-name">{name}</span>
        {typeText && <span className="ml-param-tag">{typeText}</span>}
        {location && <span className="ml-param-tag">{location}</span>}
        {nullable && <span className="ml-param-fmt">nullable</span>}
        {deprecated && <span className="ml-param-deprecated">deprecated</span>}
        {required && <span className="ml-param-required">required</span>}
        {shape.format && <span className="ml-param-fmt">· {shape.format}</span>}
      </div>
      {(description || shape.description) && (
        <div
          className="ml-param-desc"
          dangerouslySetInnerHTML={{ __html: mdToHtml((description ?? shape.description)!) }}
        />
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
      {shape.properties && <NestedObject schema={shape} />}
      {shape.type === "array" && shape.items && <NestedArray items={normalizeField(shape.items).schema} />}
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
  if (!items.properties) return null;
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
  return typeLabel(schema);
}
