/* ── doc-action Markdown generator (from a section's DOM) ── */
export function apiSecToMarkdown(sec: Pick<HTMLElement, "querySelector" | "querySelectorAll" | "textContent">): string {
  const clean = (s?: string | null) => (s || "").replace(/\s+/g, " ").trim();
  let md = "";
  const h = sec.querySelector("h1, h2");
  if (h) md += "# " + clean(h.textContent) + "\n\n";
  const path = sec.querySelector(".api-path");
  if (path) md += "`" + clean(path.textContent) + "`\n\n";
  // Prefer the original markdown (data-md) so link targets survive; fall back to rendered text.
  const lead = sec.querySelector(".lead, .sec-lead, .api-summary");
  if (lead) md += (lead.getAttribute("data-md") ?? clean(lead.textContent)) + "\n\n";
  const attrs = sec.querySelectorAll(".attr");
  if (attrs.length) {
    md += (/parameter/i.test(sec.textContent || "") ? "## Parameters\n\n" : "## Attributes\n\n");
    attrs.forEach((a) => {
      const k = a.querySelector(".ak");
      const t = a.querySelector(".at");
      const req = a.querySelector(".req");
      const d = a.querySelector(".ad");
      md += "- `" + clean(k?.textContent) + "` (" + clean(t?.textContent) + (req ? ", required" : "") + ") — " + clean(d?.textContent) + "\n";
    });
    md += "\n";
  }
  const eps = sec.querySelectorAll(".ep-row");
  if (eps.length) {
    md += "## Endpoints\n\n";
    eps.forEach((r) => {
      const t = r.querySelector(".ep-title");
      const p = r.querySelector(".ep-path");
      md += "- " + clean(t?.textContent) + " — `" + clean(p?.textContent) + "`\n";
    });
    md += "\n";
  }
  const pre = sec.querySelector(".code-card pre, .ex-resp pre");
  if (pre && /object/i.test(h?.textContent || "")) md += "```json\n" + (pre.textContent || "").trim() + "\n```\n";
  return md.trim();
}
