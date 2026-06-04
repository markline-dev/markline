"use client";

import { Children, isValidElement, useState } from "react";

/* Interactive authoring components (client). Static ones live in authoring.tsx. */

/* ── Tabs ── */

type TabProps = { title: string; children: React.ReactNode };

export function Tabs({ children }: { children: React.ReactNode }) {
  const tabs = Children.toArray(children).filter(isValidElement) as React.ReactElement<TabProps>[];
  const [active, setActive] = useState(0);
  if (tabs.length === 0) return null;
  return (
    <div>
      <div className="tabs-bar">
        {tabs.map((t, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActive(i)}
            className={i === active ? "active" : undefined}
          >
            {t.props.title}
          </button>
        ))}
      </div>
      <div className="tabs-body">{tabs[active]}</div>
    </div>
  );
}

export function Tab({ children }: TabProps) {
  return <>{children}</>;
}

/* ── Accordions ── */

export function Accordion({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="ml-accordion">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`ml-accordion-toggle${open ? " open" : ""}`}
      >
        <span className="title">{title}</span>
        <svg
          width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6}
          className="chev"
          aria-hidden
        >
          <path d="m6 4 4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && <div className="ml-accordion-body">{children}</div>}
    </div>
  );
}

export function AccordionGroup({ children }: { children: React.ReactNode }) {
  return <div className="ml-accordion-group">{children}</div>;
}
