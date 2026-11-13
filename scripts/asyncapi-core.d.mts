// Types for scripts/asyncapi-core.mjs, which lib/asyncapi.ts and build-search import.
import type { AsyncChannel, AsyncDoc, Perspective } from "../lib/asyncapi";

export function normalizeAsyncApi(input: unknown, opts?: { perspective?: Perspective; hideExtensions?: readonly string[] }): AsyncDoc;

export type Resource = { name: string; paths: string[] };
export function attachChannels(
  channels: AsyncChannel[],
  resources: Resource[],
  /** A channel tag → the resource it files under (after `api.tags`), or null when hidden. */
  resourceOfTag?: (tag: string) => string | null,
): { byResource: Map<string, AsyncChannel[]>; rest: AsyncChannel[]; hidden: AsyncChannel[] };

export const WEBSOCKETS_TAG: "WebSockets";
export function joinUrl(server: string, address: string): string;
export function readAsyncApiFile(
  file: string,
  opts?: { perspective?: Perspective; showDeprecated?: boolean; hideExtensions?: readonly string[] },
): { channels: AsyncChannel[]; tagGroups?: unknown[]; warnings: string[] } | null;
