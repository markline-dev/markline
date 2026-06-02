import { Children, cloneElement, isValidElement } from "react";
import Link from "next/link";

/* ──────────────────────────────────────────────────────────────────────────
 * Authoring components — available in any MDX page without an import.
 * Static (server) components live here; interactive ones in authoring-client.
 * ────────────────────────────────────────────────────────────────────────── */

/* ── Admonition callouts: Note / Tip / Info / Warning / Danger / Check ── */

function Admonition({
  accent,
  icon,
  title,
  children,
}: {
  accent: string;
  icon: React.ReactNode;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="my-5 flex gap-3 p-4 rounded-2 border"
      style={{ borderColor: `${accent}55`, background: `color-mix(in oklab, ${accent} 8%, transparent)` }}
    >
      <span className="flex-shrink-0 mt-[2px]" style={{ color: accent }} aria-hidden>
        {icon}
      </span>
      <div className="text-14 text-slate-6 leading-[1.6] min-w-0 [&>p]:my-0 [&>p+p]:mt-2 [&>:last-child]:mb-0">
        {title && <div className="font-semibold text-ink mb-1">{title}</div>}
        {children}
      </div>
    </div>
  );
}

const ICON = {
  info: (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6}>
      <circle cx="8" cy="8" r="6.5" /><path d="M8 7.2v4M8 5.2h.01" strokeLinecap="round" />
    </svg>
  ),
  tip: (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6}>
      <path d="M8 1.5a4.5 4.5 0 0 0-2.6 8.2c.4.3.6.7.6 1.1v.7h4v-.7c0-.4.2-.8.6-1.1A4.5 4.5 0 0 0 8 1.5Z" />
      <path d="M6 13.5h4M6.5 15h3" strokeLinecap="round" />
    </svg>
  ),
  warning: (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6}>
      <path d="M8 1.8 1.5 13.2h13L8 1.8Z" strokeLinejoin="round" /><path d="M8 6.4v3.2M8 11.6h.01" strokeLinecap="round" />
    </svg>
  ),
  danger: (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6}>
      <circle cx="8" cy="8" r="6.5" /><path d="m5.8 5.8 4.4 4.4M10.2 5.8 5.8 10.2" strokeLinecap="round" />
    </svg>
  ),
  check: (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6}>
      <circle cx="8" cy="8" r="6.5" /><path d="m5.3 8.2 1.8 1.8 3.6-3.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

export function Note({ title, children }: { title?: string; children: React.ReactNode }) {
  return <Admonition accent="#3E59F3" icon={ICON.info} title={title}>{children}</Admonition>;
}
export function Info({ title, children }: { title?: string; children: React.ReactNode }) {
  return <Admonition accent="#3E59F3" icon={ICON.info} title={title}>{children}</Admonition>;
}
export function Tip({ title, children }: { title?: string; children: React.ReactNode }) {
  return <Admonition accent="#15A66B" icon={ICON.tip} title={title}>{children}</Admonition>;
}
export function Check({ title, children }: { title?: string; children: React.ReactNode }) {
  return <Admonition accent="#15A66B" icon={ICON.check} title={title}>{children}</Admonition>;
}
export function Warning({ title, children }: { title?: string; children: React.ReactNode }) {
  return <Admonition accent="#E8571F" icon={ICON.warning} title={title}>{children}</Admonition>;
}
export function Danger({ title, children }: { title?: string; children: React.ReactNode }) {
  return <Admonition accent="#E14F4F" icon={ICON.danger} title={title}>{children}</Admonition>;
}

/* ── Cards ── */

export function Card({
  title,
  icon,
  href,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  href?: string;
  children?: React.ReactNode;
}) {
  const cls =
    "flex flex-col gap-1.5 p-5 border border-slate-3 rounded-3 bg-paper-2 text-ink no-underline";
  const inner = (
    <>
      {icon && <span className="text-brand mb-1">{icon}</span>}
      <span className="text-16 font-semibold">{title}</span>
      {children && <span className="text-14 text-slate-5 leading-[1.55]">{children}</span>}
    </>
  );
  return href ? (
    <Link href={href} className={`${cls} group hover:border-brand transition-colors`}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export function CardGroup({ cols = 2, children }: { cols?: number; children: React.ReactNode }) {
  return (
    <div
      className="grid gap-3 my-6 cardgroup"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      <style>{`@media (max-width: 720px) { .cardgroup { grid-template-columns: 1fr !important; } }`}</style>
      {children}
    </div>
  );
}

/* ── Steps ── */

export function Steps({ children }: { children: React.ReactNode }) {
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <div className="my-6 flex flex-col">
      {items.map((child, i) =>
        cloneElement(child as React.ReactElement<StepProps>, {
          __num: i + 1,
          __last: i === items.length - 1,
        }),
      )}
    </div>
  );
}

type StepProps = { title?: string; children: React.ReactNode; __num?: number; __last?: boolean };

export function Step({ title, children, __num, __last }: StepProps) {
  return (
    <div className="flex gap-4 pb-6 relative last:pb-0">
      {!__last && <span className="absolute left-[15px] top-9 bottom-1 w-px bg-slate-3" aria-hidden />}
      <span className="w-8 h-8 rounded-full border border-slate-3 bg-paper-2 flex items-center justify-center font-mono text-13 text-ink flex-shrink-0 z-10">
        {__num}
      </span>
      <div className="pt-1 min-w-0 [&>:last-child]:mb-0">
        {title && <div className="font-semibold text-ink mb-1.5">{title}</div>}
        {children}
      </div>
    </div>
  );
}

/* ── Param / Response fields ── */

export function ParamField({
  path,
  query,
  header,
  body,
  name,
  type,
  required,
  default: defaultValue,
  children,
}: {
  path?: string;
  query?: string;
  header?: string;
  body?: string;
  name?: string;
  type?: string;
  required?: boolean;
  default?: string | number | boolean;
  children?: React.ReactNode;
}) {
  const label = path ?? query ?? header ?? body ?? name ?? "";
  return (
    <div className="py-3 border-b border-slate-3 first:border-t first:mt-4">
      <div className="flex items-center gap-2 flex-wrap">
        <code className="ci">{label}</code>
        {type && <span className="font-mono text-12 text-slate-5">{type}</span>}
        {required && (
          <span className="font-mono text-10 uppercase tracking-[0.06em] text-[#E14F4F]">required</span>
        )}
        {defaultValue !== undefined && (
          <span className="font-mono text-12 text-slate-5">default: {String(defaultValue)}</span>
        )}
      </div>
      {children && <div className="text-14 text-slate-6 leading-[1.55] mt-1.5 [&>:last-child]:mb-0">{children}</div>}
    </div>
  );
}

export const ResponseField = ParamField;
