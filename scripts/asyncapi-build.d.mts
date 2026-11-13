// Types for scripts/asyncapi-build.mjs, which build-search imports.

export function asyncApiFile(dir: string, api: unknown): string;
export function asyncApiReport(
  dir: string,
  spec: unknown,
  api: unknown,
): { warnings: string[]; pages: { name: string; slug: string; title: string }[] };
