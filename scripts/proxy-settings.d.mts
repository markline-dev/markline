// Types for scripts/proxy-settings.mjs, which app/api/playground imports.

export type ProxySettings = { origins: string[]; mode?: string; found: boolean; problem?: string };

export function originsOf(urls: unknown[]): string[];
export function readProxySettings(env?: Record<string, string | undefined>, cwd?: string): ProxySettings;
