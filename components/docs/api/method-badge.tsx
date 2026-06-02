const COLORS: Record<string, { bg: string; fg: string; ring: string }> = {
  get:     { bg: "rgba(60,200,140,0.12)", fg: "#3CC88C", ring: "rgba(60,200,140,0.35)" },
  post:    { bg: "rgba(62,89,243,0.14)",  fg: "#6E86FA", ring: "rgba(62,89,243,0.4)"  },
  put:     { bg: "rgba(238,122,75,0.14)", fg: "#EE7A4B", ring: "rgba(238,122,75,0.4)" },
  patch:   { bg: "rgba(238,122,75,0.14)", fg: "#EE7A4B", ring: "rgba(238,122,75,0.4)" },
  delete:  { bg: "rgba(225,79,79,0.14)",  fg: "#E14F4F", ring: "rgba(225,79,79,0.4)"  },
  options: { bg: "rgba(120,130,160,0.14)", fg: "#7882A0", ring: "rgba(120,130,160,0.4)" },
  head:    { bg: "rgba(120,130,160,0.14)", fg: "#7882A0", ring: "rgba(120,130,160,0.4)" },
};

export function MethodBadge({ method, size = "md" }: { method: string; size?: "sm" | "md" }) {
  const m = method.toLowerCase();
  const c = COLORS[m] ?? COLORS.get;
  const padding = size === "sm" ? "px-1.5 py-px text-[9px]" : "px-2 py-0.5 text-11";
  return (
    <span
      className={`font-mono ${padding} uppercase tracking-[0.06em] rounded-1 font-medium`}
      style={{ background: c.bg, color: c.fg, border: `1px solid ${c.ring}` }}
    >
      {m}
    </span>
  );
}
