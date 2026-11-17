// Types for scripts/openapi-events.mjs, which lib/openapi.ts, lib/apiref-view.ts and asyncapi-build.mjs import.
import type { OpenAPIEvent, OpenAPIOperation } from "../lib/openapi";

export function eventAnchor(name: string): string;
export function parseWebhooks(raw: any): OpenAPIEvent[];
export function parseXEvents(xe: unknown, tags?: string[]): OpenAPIEvent[];
export function parseOperationEvents(op: any, raw: any): OpenAPIEvent[];
export function mergeTagEvents(operations: OpenAPIOperation[], tagEvents?: OpenAPIEvent[]): OpenAPIEvent[];
export function pageEvents(
  raw: any,
  opts: { tags: { name: string }[]; ops: { page: string; op: any }[]; pageOf: (tag: string) => string | null },
): Map<string, OpenAPIEvent[]>;
