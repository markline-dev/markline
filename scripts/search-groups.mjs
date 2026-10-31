// Which search group (the filter chips in the search dialog) each page belongs
// to, read from markline.json's navigation. Pure, so it can be unit-tested.
//
// - With more than one docs tab, a page's group is its tab ("Guides").
// - With one, it's the sidebar group ("Get started"). In a group with no
//   heading ("group": ""), each top-level folder is a group of its own
//   ("Train", "Deploy"), the way a help center lists collections.
// - Pages outside any group (a lone "Home" link) get none, and only show
//   under "All".

/** Every href in a list of sidebar items, depth first. */
function hrefs(items) {
  return (items ?? []).flatMap((p) => [...(p.href ? [p.href] : []), ...hrefs(p.pages)]);
}

/**
 * @returns {{ order: string[], byUrl: Map<string, string> }} group names in
 *   sidebar order, and each page URL's group.
 */
export function searchGroups(cfg) {
  const tabs = (cfg.navigation?.tabs ?? []).filter((t) => !t.openapi);
  const order = [];
  const byUrl = new Map();
  const add = (name, urls) => {
    if (!name || urls.length === 0) return;
    if (!order.includes(name)) order.push(name);
    for (const u of urls) if (!byUrl.has(u)) byUrl.set(u, name);
  };

  if (tabs.length > 1) {
    for (const tab of tabs) add(tab.label, (tab.groups ?? []).flatMap((g) => hrefs(g.pages)));
    return { order, byUrl };
  }
  for (const g of tabs[0]?.groups ?? []) {
    if (g.group) add(g.group, hrefs(g.pages));
    else for (const item of g.pages ?? []) if (item.pages?.length) add(item.label, hrefs([item]));
  }
  return { order, byUrl };
}

/**
 * Where each page sits, shown beside its search result so that pages sharing
 * a title ("Overview") can be told apart: its sidebar group heading, then
 * each folder above it ("Agents › Persona"). A page with neither shows its
 * tab when the site has more than one.
 *
 * @returns {Map<string, string>} page URL → "Group › Folder".
 */
export function searchTrails(cfg) {
  const tabs = (cfg.navigation?.tabs ?? []).filter((t) => !t.openapi);
  const out = new Map();
  const walk = (items, trail, tab) => {
    for (const item of items ?? []) {
      if (item.href && !out.has(item.href)) {
        const parts = trail.length ? trail : tabs.length > 1 && tab ? [tab] : [];
        if (parts.length) out.set(item.href, parts.join(" › "));
      }
      if (item.pages?.length) walk(item.pages, [...trail, item.label].filter(Boolean), tab);
    }
  };
  for (const tab of tabs) {
    for (const g of tab.groups ?? []) walk(g.pages, g.group ? [g.group] : [], tab.label);
  }
  return out;
}
