/* What <Video src> points at: a file the browser plays itself, or a hosted
 * video that needs its provider's embed URL. Pure, so it's unit-tested. */

export type VideoSource =
  | { kind: "file"; src: string }
  | { kind: "embed"; src: string; provider: "youtube" | "vimeo" | "loom" | "wistia" | "other" };

const FILE_EXT = /\.(mp4|webm|ogv|ogg|mov|m4v)(\?.*)?$/i;

/** "1m30s", "90s" or "90" → 90. */
function seconds(t: string | null): number | undefined {
  if (!t) return undefined;
  if (/^\d+$/.test(t)) return Number(t);
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m || !m[0]) return undefined;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

export function resolveVideo(src: string): VideoSource {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    // A site path like /videos/intro.mp4.
    return { kind: "file", src };
  }
  if (FILE_EXT.test(url.pathname)) return { kind: "file", src };

  const host = url.hostname.replace(/^www\.|^m\./, "");
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "youtube.com" || host === "youtube-nocookie.com" || host === "youtu.be") {
    const id =
      host === "youtu.be"
        ? parts[0]
        : url.searchParams.get("v") ?? (["embed", "shorts", "live"].includes(parts[0]) ? parts[1] : undefined);
    if (id) {
      const start = seconds(url.searchParams.get("t") ?? url.searchParams.get("start"));
      return {
        kind: "embed",
        provider: "youtube",
        src: `https://www.youtube-nocookie.com/embed/${id}${start ? `?start=${start}` : ""}`,
      };
    }
  }
  if (host === "vimeo.com" && /^\d+$/.test(parts[0] ?? "")) {
    return { kind: "embed", provider: "vimeo", src: `https://player.vimeo.com/video/${parts[0]}` };
  }
  if (host === "player.vimeo.com") return { kind: "embed", provider: "vimeo", src };
  if (host === "loom.com" && (parts[0] === "share" || parts[0] === "embed") && parts[1]) {
    return { kind: "embed", provider: "loom", src: `https://www.loom.com/embed/${parts[1]}` };
  }
  if (host.endsWith("wistia.com") && parts[0] === "medias" && parts[1]) {
    return { kind: "embed", provider: "wistia", src: `https://fast.wistia.net/embed/iframe/${parts[1]}` };
  }
  if (host === "fast.wistia.net") return { kind: "embed", provider: "wistia", src };
  return { kind: "embed", provider: "other", src };
}
