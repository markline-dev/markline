import fs from "node:fs";
import path from "node:path";
import { HOME_PACKAGE, HOME_REPO, isStat, statKey, type Stat, type StarsMode } from "./github-stars";
import { loadConfig } from "./config";

/* The stats the build fetched (scripts/github-stats.mjs) into
 * .markline-github.json beside the app. Server only. */

let cache: Record<string, Stat> | undefined;

/** The baked value for a stat key ("stars:owner/repo"), if the build got one. */
export function bakedStat(key: string | undefined): Stat | undefined {
  if (!key) return undefined;
  if (!cache) {
    try {
      cache = JSON.parse(fs.readFileSync(path.join(process.cwd(), ".markline-github.json"), "utf8"));
    } catch {
      cache = {};
    }
  }
  const s = cache?.[key];
  return isStat(key, s) ? s : undefined;
}

/** topbar.githubStars, for everything that shows a count. */
export const starsMode = (): StarsMode => loadConfig().topbar.githubStars ?? "live";

export type HomeStats = Record<"stars" | "contributors" | "version", { key?: string; baked?: Stat }> & { mode: StarsMode };

/** What Markline's own home card shows, with the build's values. */
export function homeStats(): HomeStats {
  const one = (key: string | undefined) => ({ key, baked: bakedStat(key) });
  return {
    stars: one(statKey("stars", HOME_REPO)),
    contributors: one(statKey("contributors", HOME_REPO)),
    version: one(statKey("version", HOME_PACKAGE)),
    mode: starsMode(),
  };
}
