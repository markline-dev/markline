const METHODS = ["get", "post", "put", "patch", "delete", "options", "head"];

export function orderedResourceTags(spec) {
  const declared = (spec.tags ?? []).map((tag) => tag.name);
  const declaredSet = new Set(declared);
  const discovered = new Set();

  for (const item of Object.values(spec.paths ?? {})) {
    for (const method of METHODS) {
      const op = item[method];
      if (!op || !Array.isArray(op.tags)) continue;
      for (const tag of op.tags) {
        if (!declaredSet.has(tag)) discovered.add(tag);
      }
    }
  }

  return [...declared, ...[...discovered].sort((a, b) => a.localeCompare(b))];
}
