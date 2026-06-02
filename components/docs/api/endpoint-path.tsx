import { MethodBadge } from "./method-badge";

export function EndpointPath({ method, path }: { method: string; path: string }) {
  const segments = path.split(/(\{[^}]+\})/g).filter(Boolean);
  return (
    <div className="flex items-center gap-2.5 my-5 px-3 py-2 rounded-2 bg-paper-2 border border-slate-3 overflow-x-auto">
      <MethodBadge method={method} />
      <code className="font-mono text-13 text-ink whitespace-nowrap">
        {segments.map((s, i) =>
          /^\{[^}]+\}$/.test(s) ? (
            <span
              key={i}
              className="px-1 rounded-sm"
              style={{ background: "rgba(110,134,250,0.14)", color: "#6E86FA" }}
            >
              {s}
            </span>
          ) : (
            <span key={i} className="text-slate-6">
              {s}
            </span>
          ),
        )}
      </code>
    </div>
  );
}
