import { Children, cloneElement, isValidElement } from "react";
import Link from "next/link";
import { resolveVideo } from "@/lib/video";
import { isIconPath, navIcon } from "./nav-icons";

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

/** A Phosphor name ("rocket-launch", or "rocket-launch:duotone") or an image path ("/icons/agents.svg")
 * becomes the icon; anything else, such as an emoji or an element, renders as
 * given. */
function cardIcon(icon: React.ReactNode): React.ReactNode {
  if (typeof icon !== "string" || !(/^[A-Za-z][\w-]*(:[a-z]+)?$/.test(icon) || isIconPath(icon))) return icon;
  return navIcon(icon, 18) ?? icon;
}

export function Card({
  title,
  icon,
  href,
  kicker,
  variant,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  href?: string;
  /** "tile": the icon in a tinted square above the title, as on a
   *  help-center home. `<CardGroup variant="tile">` sets it for a whole grid. */
  variant?: "default" | "tile";
  /** Optional mono eyebrow (the design's .k). */
  kicker?: string;
  children?: React.ReactNode;
}) {
  const inner = (
    <>
      {kicker && <div className="k">{kicker}</div>}
      <div className="h">
        <span className="ml-card-h-inner">
          {icon && <span aria-hidden className="ml-card-icon">{cardIcon(icon)}</span>}
          {title}
        </span>
        {href && CardArrow}
      </div>
      {/* A div, not a <p>: in MDX a body on its own line is already wrapped
          in a <p>, and <p>-in-<p> is invalid nesting → a hydration mismatch
          (React #418). An inline body stays a bare text node, so the div also
          carries the styling for both forms. */}
      {children && <div className="ml-card-body">{children}</div>}
    </>
  );
  const cls = variant === "tile" ? "next-card next-card--tile" : "next-card";
  return href ? (
    <Link href={href} className={cls}>{inner}</Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export function CardGroup({
  cols = 2,
  variant,
  children,
}: {
  cols?: number;
  /** "tile" for every card in the grid; see `<Card variant>`. */
  variant?: "default" | "tile";
  children: React.ReactNode;
}) {
  return (
    <div className={`next-grid cardgroup${variant === "tile" ? " cardgroup--tile" : ""}`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
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

const PageIcon = (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h6" />
  </svg>
);

/**
 * A list of links, one row each: title, optional description, and an icon
 * on the right. For collection pages, "see also" lists, and the "Related
 * articles" list at the end of a page.
 */
export function LinkList({ children }: { children: React.ReactNode }) {
  return <ul className="ml-links">{children}</ul>;
}

export function LinkItem({
  href,
  title,
  description,
  meta,
  icon,
}: {
  href: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Short accent-coloured text before the description, e.g. "3 articles". */
  meta?: React.ReactNode;
  /** A Phosphor icon name in place of the page icon, or "none". */
  icon?: string;
}) {
  const ic = icon === "none" ? null : icon ? navIcon(icon, 20) ?? PageIcon : PageIcon;
  return (
    <li>
      <Link href={href} className="ml-link">
        <span className="ml-link-txt">
          <span className="ml-link-t">{title}</span>
          {(meta || description) && (
            <span className="ml-link-d">
              {meta && <span className="ml-link-m">{meta}</span>}
              {meta && description && " · "}
              {description}
            </span>
          )}
        </span>
        {ic && <span className="ml-link-ic">{ic}</span>}
      </Link>
    </li>
  );
}

/**
 * A video: a file (`.mp4`, `.webm`) in the browser's own player, or a
 * YouTube, Vimeo, Loom or Wistia link as that provider's embed. Full column
 * width at 16:9; embeds load when scrolled into view.
 */
export function Video({
  src,
  title,
  poster,
  caption,
}: {
  src: string;
  /** Names the embed for screen readers. */
  title?: string;
  /** Image shown before a video file plays. */
  poster?: string;
  caption?: React.ReactNode;
}) {
  const video = resolveVideo(src);
  return (
    <figure className="ml-video">
      <div className="ml-video-frame">
        {video.kind === "file" ? (
          <video src={video.src} poster={poster} controls preload="metadata" playsInline title={title} />
        ) : (
          <iframe
            src={video.src}
            title={title ?? "Video"}
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        )}
      </div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
