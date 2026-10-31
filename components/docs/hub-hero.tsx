"use client";

/**
 * The hub layout's hero (frontmatter `layout: hub`): the page's title and lede
 * with a large search box, full width above the sidebar and content — a
 * help-center home. The box opens the docs search dialog the shell below
 * already mounts, so it searches the same index as ⌘K.
 */
export function HubHero({
  title,
  lede,
  image,
  placeholder = "Search for articles…",
}: {
  title: string;
  lede?: string;
  image?: string;
  placeholder?: string;
}) {
  return (
    <section className={`hub-hero${image ? " hub-hero--image" : ""}`}>
      <div className="hub-hero-in">
        <div className="hub-hero-txt">
          <h1>{title}</h1>
          {lede && <p>{lede}</p>}
          <button
            type="button"
            className="hub-search"
            onClick={() => window.dispatchEvent(new CustomEvent("ml-docs-search-open"))}
          >
            <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <span className="lbl">{placeholder}</span>
            <span className="kbd">⌘K</span>
          </button>
        </div>
        {image && <img className="hub-hero-img" src={image} alt="" />}
      </div>
    </section>
  );
}
