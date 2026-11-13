// Types for scripts/asyncapi-build.mjs, which build-search and lib/openapi.ts import.
import type { AsyncChannel } from "../lib/asyncapi";

/** What an AsyncAPI document adds to the reference's plan. */
export type ChannelExtras = { pages: string[]; groups?: unknown[]; known: string[]; labels: Record<string, string>; warnings?: string[] };

export function asyncApiFile(dir: string, api: unknown): string;
export const ASYNC_ONLY: "x-markline-asyncapi-only";
export function readApiSpec(dir: string, api: unknown): unknown | null;
export function channelExtras(
  dir: string,
  spec: unknown,
  api: unknown,
): {
  read: { channels: AsyncChannel[]; tagGroups?: unknown[]; warnings: string[] } | null;
  /** Each page's channels, in the order placeChannels() gives them. */
  placed: Map<string, AsyncChannel[]>;
  extras: ChannelExtras;
};
export type ChannelPage = {
  channel: AsyncChannel;
  page: { name: string; slug: string; title: string; section: string | null };
  /** Its id on that page, and `/api-reference/<page>#<id>`. */
  id: string;
  url: string;
};
export function channelPages(dir: string, spec: unknown, api: unknown): ChannelPage[];
export function channelRecords(
  dir: string,
  spec: unknown,
  api: unknown,
  toPlainText?: (s: string) => string,
): { url: string; title: string; content: string; meta: string }[];
export function channelLlms(dir: string, spec: unknown, api: unknown, abs?: (url: string) => string): { index: string; full: string };
export function asyncApiReport(
  dir: string,
  spec: unknown,
  api: unknown,
): { warnings: string[]; pages: { name: string; slug: string; title: string; section: string | null }[] };
