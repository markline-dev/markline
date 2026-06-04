import { MethodBadge } from "./method-badge";

export function EndpointPath({ method, path }: { method: string; path: string }) {
  const segments = path.split(/(\{[^}]+\})/g).filter(Boolean);
  return (
    <div className="ml-endpoint-path">
      <MethodBadge method={method} />
      <code>
        {segments.map((s, i) =>
          /^\{[^}]+\}$/.test(s) ? (
            <span key={i} className="seg-var">{s}</span>
          ) : (
            <span key={i} className="seg-static">{s}</span>
          ),
        )}
      </code>
    </div>
  );
}
