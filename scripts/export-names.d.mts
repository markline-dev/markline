// Types for scripts/export-names.mjs, which the tests import.

type Page = { url: string; source?: string };

export const CHANGELOG_PER_PAGE: number;
export function payloadFile(url: string): string;
export function exportClashes(pages: Page[], files: string[]): (Page & { file: string })[];
export function clashMessage(clashes: (Page & { file: string })[]): string;
