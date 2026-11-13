"use client";

import { Children, isValidElement, useEffect, useId, useRef, useState } from "react";

/* Interactive authoring components (client). Static ones live in authoring.tsx. */

/** Tells "On this page" that what's showing changed (a tab picked, an
 *  accordion opened), so it shows the headings that now are. */
export const VISIBILITY_EVENT = "markline:visibility";

/**
 * Content that's in the page but not showing is hidden "until found": the
 * browser's find-in-page can still reach it, and opens it (the `beforematch`
 * event). React writes `hidden` as a plain boolean, so once mounted each hidden
 * pane is given the "until-found" value where the browser supports it; where
 * it doesn't, the pane stays plainly hidden.
 */
function useUntilFound(panes: React.RefObject<(HTMLElement | null)[]>, key: unknown) {
  useEffect(() => {
    if (!("onbeforematch" in document.body)) return;
    for (const p of panes.current) if (p?.hasAttribute("hidden")) p.setAttribute("hidden", "until-found");
  }, [panes, key]);
}

/**
 * Calls `reveal(i)` for the pane that holds the URL's #target, on load and
 * when the hash changes, and for a pane find-in-page matches in.
 */
function useReveal(panes: React.RefObject<(HTMLElement | null)[]>, onReveal: (i: number) => void, shown: unknown) {
  // The latest callback, so the listeners are added once.
  const latest = useRef(onReveal);
  latest.current = onReveal;
  // The #target to go to once its pane is showing: the browser scrolled while
  // it was hidden, with no size, and showing it moves the page.
  const target = useRef<HTMLElement | null>(null);
  useEffect(() => {
    target.current?.scrollIntoView();
    target.current = null;
  }, [shown]);
  useEffect(() => {
    const reveal = (i: number) => latest.current(i);
    const holding = (el: Element | null) => (el ? panes.current.findIndex((p) => p?.contains(el)) : -1);
    const onHash = () => {
      let id = location.hash.slice(1);
      try {
        id = decodeURIComponent(id);
      } catch {}
      const el = id ? document.getElementById(id) : null;
      const i = holding(el);
      if (i < 0) return;
      // The browser may already have shown it ("until found" content opens on
      // a #link before hashchange fires), so always go there once it's shown:
      // after the reveal renders, or shortly if there was nothing to render.
      target.current = el;
      reveal(i);
      setTimeout(() => {
        target.current?.scrollIntoView();
        target.current = null;
      }, 50);
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    const off = panes.current.map((p, i) => {
      if (!p) return () => {};
      const f = () => reveal(i);
      p.addEventListener("beforematch", f);
      return () => p.removeEventListener("beforematch", f);
    });
    return () => {
      window.removeEventListener("hashchange", onHash);
      off.forEach((f) => f());
    };
  }, [panes]);
}

/* ── Tabs ── */

type TabProps = { title: string; children: React.ReactNode };

/** Every tab is in the page, those not picked hidden until found, so links
 *  and "On this page" can reach any of them. */
export function Tabs({ children }: { children: React.ReactNode }) {
  const tabs = Children.toArray(children).filter(isValidElement) as React.ReactElement<TabProps>[];
  const [active, setActive] = useState(0);
  const id = useId();
  const panes = useRef<(HTMLElement | null)[]>([]);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  useReveal(panes, setActive, active);
  useUntilFound(panes, active);
  useEffect(() => {
    window.dispatchEvent(new Event(VISIBILITY_EVENT));
  }, [active]);
  if (tabs.length === 0) return null;
  const pick = (i: number, focus = false) => {
    setActive(i);
    if (focus) buttons.current[i]?.focus();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (step) pick((active + step + tabs.length) % tabs.length, true);
    else if (e.key === "Home") pick(0, true);
    else if (e.key === "End") pick(tabs.length - 1, true);
    else return;
    e.preventDefault();
  };
  return (
    <div className="tabs">
      <div className="tabs-bar" role="tablist" onKeyDown={onKeyDown}>
        {tabs.map((t, i) => (
          <button
            key={i}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${i}`}
            aria-selected={i === active}
            aria-controls={`${id}-panel-${i}`}
            tabIndex={i === active ? 0 : -1}
            onClick={() => pick(i)}
            className={i === active ? "active" : undefined}
          >
            {t.props.title}
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div
          key={i}
          ref={(el) => {
            panes.current[i] = el;
          }}
          role="tabpanel"
          id={`${id}-panel-${i}`}
          aria-labelledby={`${id}-tab-${i}`}
          className="tabs-body"
          hidden={i !== active}
        >
          {t}
        </div>
      ))}
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
  const body = useRef<(HTMLElement | null)[]>([]);
  useReveal(body, () => setOpen(true), open);
  useUntilFound(body, open);
  useEffect(() => {
    window.dispatchEvent(new Event(VISIBILITY_EVENT));
  }, [open]);
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
      {/* Always in the page, hidden until found while closed. */}
      <div
        className="ml-accordion-body"
        ref={(el) => {
          body.current[0] = el;
        }}
        hidden={!open}
      >
        {children}
      </div>
    </div>
  );
}

export function AccordionGroup({ children }: { children: React.ReactNode }) {
  return <div className="ml-accordion-group">{children}</div>;
}
