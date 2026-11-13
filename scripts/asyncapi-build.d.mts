// Types for scripts/asyncapi-build.mjs, which build-search and lib/openapi.ts import.
import type { AsyncChannel } from "../lib/asyncapi";

/** What an AsyncAPI document adds to the reference's plan. */
export type ChannelExtras = { pages: string[]; groups?: unknown[]; known: string[]; labels: Record<string, string>; warnings?: string[] };

export function asyncApiFile(dir: string, api: unknown): string;
export function readApiSpec(dir: string, api: unknown): unknown | null;
export function channelExtras(
  dir: string,
  spec: unknown,
  api: unknown,
): { read: { channels: AsyncChannel[]; tagGroups?: unknown[]; warnings: string[] } | null; extras: ChannelExtras };
export function asyncApiReport(
  dir: string,
  spec: unknown,
  api: unknown,
): { warnings: string[]; pages: { name: string; slug: string; title: string; section: string | null }[] };
