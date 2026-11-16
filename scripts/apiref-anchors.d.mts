// Types for scripts/apiref-anchors.mjs, which lib/apiref-view.ts and asyncapi-build.mjs import.

export function anchorSlug(s: string): string;
export function uniqueAnchors(bases: string[], reserved?: Iterable<string>): string[];
export function pageAnchors(
  pageSlug: string,
  operations: { summary?: string; operationId: string }[],
  channels?: { title?: string; address: string }[],
  eventIds?: string[],
): { operations: string[]; channels: string[] };
