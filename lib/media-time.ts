/**
 * Media player helpers for <Audio>. Pure, so they can be unit-tested.
 */

/** 75 → "01:15", 3725 → "1:02:05". Unknown or negative → "00:00". */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

/** Playback speeds the speed button steps through, in order. */
export const SPEEDS = [1, 1.25, 1.5, 2, 0.75] as const;

export function nextSpeed(current: number): number {
  const i = SPEEDS.indexOf(current as (typeof SPEEDS)[number]);
  return SPEEDS[(i + 1) % SPEEDS.length];
}

/** "1x" → "1.0x", 1.25 → "1.25x". */
export function speedLabel(rate: number): string {
  return `${Number.isInteger(rate) ? rate.toFixed(1) : String(rate)}x`;
}
