// Types for scripts/openapi-prune.mjs, which lib/openapi.ts, scripts/asyncapi-core.mjs and the tests import.

export function pruneSpec<T>(raw: T, hideExtensions: readonly string[]): T;
/** One schema's visible part, for a schema with no `$ref`s left. Undefined when nothing of it is visible. */
export function pruneSchema<T>(schema: T, hideExtensions: readonly string[]): T | undefined;
/** An example without the keys `schema` (no `$ref`s left) declares hidden. */
export function pruneExample(value: unknown, schema: unknown, hideExtensions: readonly string[]): unknown;
