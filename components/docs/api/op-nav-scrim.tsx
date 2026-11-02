"use client";

/**
 * Scrim behind the per-operation page's mobile sidebar drawer
 * (body.docnav-open contract). The page itself is a server component, so the
 * click-to-close handler lives here.
 */
export function OpNavScrim() {
  return <div className="docnav-scrim" onClick={() => document.body.classList.remove("docnav-open")} />;
}
