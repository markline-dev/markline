"use client";

import { useEffect, useState } from "react";
import { browserStore, refreshStat, shown, type Stat, type StarsMode } from "@/lib/github-stars";

/** A stat to show: the page's baked value, then, in "live" mode, a newer one
 *  from this reader's cache or GitHub (lib/github-stars.ts). */
export function useStat(key: string | undefined, baked: Stat | undefined, mode: StarsMode): string | undefined {
  const [stat, setStat] = useState(baked);
  useEffect(() => {
    if (!key) return;
    let live = true;
    refreshStat(key, baked, mode, (s) => live && setStat(s), { store: browserStore() });
    return () => {
      live = false;
    };
  }, [key, baked, mode]);
  return mode === false ? undefined : shown(stat);
}

/** `<GitHubStars repo="owner/name" />`: "★ 1.2k", linking to the repo. Nothing
 *  until there's a count. */
export function GitHubStarsLink({ repo, statKey, baked, mode }: { repo: string; statKey?: string; baked?: Stat; mode: StarsMode }) {
  const count = useStat(statKey, baked, mode);
  if (!statKey || !count) return null;
  return (
    <a className="gh-stars" href={`https://github.com/${repo}`} target="_blank" rel="noopener noreferrer" aria-label={`${repo} on GitHub: ${count} stars`}>
      <span className="star" aria-hidden="true">★</span> {count}
    </a>
  );
}
