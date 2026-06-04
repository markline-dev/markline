import { Children, cloneElement, isValidElement } from "react";
import Link from "next/link";

/* ──────────────────────────────────────────────────────────────────────────
 * Authoring components — available in any MDX page without an import.
 * Static (server) components live here; interactive ones in authoring-client.
 * ────────────────────────────────────────────────────────────────────────── */

/* ── Admonition callouts: Note / Tip / Info / Warning / Danger / Check ── */

/** Maps an admonition to the design's three callout tones (.callout / .tone-*). */
function Admonition({
  tone,
  icon,
  title,
  children,
}: {
  tone: "info" | "ok" | "warn";
  icon: React.ReactNode;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`callout tone-${tone}`}>
      <span className="ic" aria-hidden>{icon}</span>
      <div className="callout-body">
        {title && <strong>{title}</strong>}
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
  return <Admonition tone="info" icon={ICON.info} title={title}>{children}</Admonition>;
}
export function Info({ title, children }: { title?: string; children: React.ReactNode }) {
  return <Admonition tone="info" icon={ICON.info} title={title}>{children}</Admonition>;
}
export function Tip({ title, children }: { title?: string; children: React.ReactNode }) {
  return <Admonition tone="ok" icon={ICON.tip} title={title}>{children}</Admonition>;
}
export function Check({ title, children }: { title?: string; children: React.ReactNode }) {
  return <Admonition tone="ok" icon={ICON.check} title={title}>{children}</Admonition>;
}
export function Warning({ title, children }: { title?: string; children: React.ReactNode }) {
  return <Admonition tone="warn" icon={ICON.warning} title={title}>{children}</Admonition>;
}
export function Danger({ title, children }: { title?: string; children: React.ReactNode }) {
  return <Admonition tone="warn" icon={ICON.danger} title={title}>{children}</Admonition>;
}

/* ── Cards ── */

const CardArrow = (
  <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export function Card({
  title,
  icon,
  href,
  kicker,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  href?: string;
  /** Optional mono eyebrow (the design's .k). */
  kicker?: string;
  children?: React.ReactNode;
}) {
  const inner = (
    <>
      {kicker && <div className="k">{kicker}</div>}
      <div className="h">
        <span className="ml-card-h-inner">
          {icon && <span aria-hidden>{icon}</span>}
          {title}
        </span>
        {href && CardArrow}
      </div>
      {children && <p>{children}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="next-card">{inner}</Link>
  ) : (
    <div className="next-card">{inner}</div>
  );
}

export function CardGroup({ cols = 2, children }: { cols?: number; children: React.ReactNode }) {
  return (
    <div className="next-grid cardgroup" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      <style>{`@media (max-width: 720px) { .cardgroup { grid-template-columns: 1fr !important; } }`}</style>
      {children}
    </div>
  );
}

/* ── Steps ── */

export function Steps({ children }: { children: React.ReactNode }) {
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <div className="steps">
      {items.map((child, i) =>
        cloneElement(child as React.ReactElement<StepProps>, { __num: i + 1 }),
      )}
    </div>
  );
}

type StepProps = { title?: string; children: React.ReactNode; __num?: number };

export function Step({ title, children, __num }: StepProps) {
  return (
    <div className="step">
      <span className="num">{__num}</span>
      {title && <h3>{title}</h3>}
      <div className="step-body">{children}</div>
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
    <div className="ml-field">
      <div className="ml-field-head">
        <code className="ci">{label}</code>
        {type && <span className="ml-field-type">{type}</span>}
        {required && <span className="ml-field-required">required</span>}
        {defaultValue !== undefined && (
          <span className="ml-field-default">default: {String(defaultValue)}</span>
        )}
      </div>
      {children && <div className="ml-field-body">{children}</div>}
    </div>
  );
}

export const ResponseField = ParamField;
