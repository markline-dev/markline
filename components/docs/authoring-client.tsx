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
    <div className="border border-slate-3 rounded-2 my-3 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left bg-paper-2 hover:bg-slate-2"
      >
        <span className="font-medium text-ink text-14">{title}</span>
        <svg
          width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6}
          className={`text-slate-5 transition-transform ${open ? "rotate-90" : ""}`}
          aria-hidden
        >
          <path d="m6 4 4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="px-4 py-3 text-14 text-slate-6 leading-[1.6] border-t border-slate-3 [&>:first-child]:mt-0 [&>:last-child]:mb-0">
          {children}
        </div>
      )}
    </div>
  );
}

export function AccordionGroup({ children }: { children: React.ReactNode }) {
  return <div className="my-6">{children}</div>;
}
