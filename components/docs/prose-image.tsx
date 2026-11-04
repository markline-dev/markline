"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Images in page text: markdown `![alt](src "caption")` and `<Image>`.
 *
 * - A URL ending in `#light` or `#dark` shows only in that theme, so a pair of
 *   screenshots can follow the reader's theme. `<Image dark="…">` does the
 *   same with one tag.
 * - The title (or `caption`) shows under the image.
 * - Clicking an image that was shrunk to fit the column opens it full size.
 *   `#nozoom` on the URL, or `zoom={false}`, turns that off.
 *
 * Rendered with spans, not <figure>: a markdown image sits inside a <p>, where
 * block elements are invalid and React would fail to hydrate.
 */

const FLAG = /#(light|dark|nozoom)$/;

function parse(src: string) {
  let s = src;
  const flags = new Set<string>();
  for (let m = s.match(FLAG); m; m = s.match(FLAG)) {
    flags.add(m[1]);
    s = s.slice(0, -m[0].length);
  }
  return { url: s, theme: flags.has("light") ? "light" : flags.has("dark") ? "dark" : undefined, zoom: !flags.has("nozoom") };
}

function Zoomable({ src, alt, theme, zoom }: { src: string; alt: string; theme?: string; zoom: boolean }) {
  const ref = useRef<HTMLImageElement>(null);
  const [canZoom, setCanZoom] = useState(false);
  const [open, setOpen] = useState(false);

  // Only offer zoom when the column actually shrank the image.
  useEffect(() => {
    const img = ref.current;
    if (!img || !zoom) return;
    const check = () => setCanZoom(img.naturalWidth > img.clientWidth * 1.15);
    if (img.complete) check();
    img.addEventListener("load", check);
    window.addEventListener("resize", check);
    return () => {
      img.removeEventListener("load", check);
      window.removeEventListener("resize", check);
    };
  }, [zoom]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const cls = ["ml-img", theme && `ml-img--${theme}`, canZoom && "ml-img--zoom"].filter(Boolean).join(" ");
  return (
    <>
      <img
        ref={ref}
        className={cls}
        src={src}
        alt={alt}
        loading="lazy"
        onClick={canZoom ? () => setOpen(true) : undefined}
        role={canZoom ? "button" : undefined}
        tabIndex={canZoom ? 0 : undefined}
        aria-label={canZoom ? `${alt || "Image"} (open full size)` : undefined}
        onKeyDown={canZoom ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setOpen(true)) : undefined}
      />
      {open &&
        createPortal(
          <div className="ml-zoom" role="dialog" aria-modal="true" aria-label={alt || "Image"} onClick={() => setOpen(false)}>
            <img src={src} alt={alt} />
            <button type="button" className="ml-zoom-x" aria-label="Close" autoFocus>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}

/** A markdown image (the `img` MDX override). */
export function ProseImage({ src = "", alt = "", title }: { src?: string; alt?: string; title?: string }) {
  const { url, theme, zoom } = parse(src);
  const img = <Zoomable src={url} alt={alt} theme={theme} zoom={zoom} />;
  if (!title) return img;
  return (
    <span className={`ml-figure${theme ? ` ml-img--${theme}` : ""}`}>
      {img}
      <span className="ml-figcaption">{title}</span>
    </span>
  );
}

/** `<Image src="/a.png" dark="/a-dark.png" alt="…" caption="…" zoom={false} />` */
export function Image({
  src,
  dark,
  alt = "",
  caption,
  zoom = true,
}: {
  src: string;
  /** The same image for dark mode. */
  dark?: string;
  alt?: string;
  caption?: string;
  zoom?: boolean;
}) {
  return (
    <span className="ml-figure">
      <Zoomable src={src} alt={alt} theme={dark ? "light" : undefined} zoom={zoom} />
      {dark && <Zoomable src={dark} alt={alt} theme="dark" zoom={zoom} />}
      {caption && <span className="ml-figcaption">{caption}</span>}
    </span>
  );
}
