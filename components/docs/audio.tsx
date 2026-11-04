"use client";

import { useEffect, useRef, useState } from "react";
import { formatTime, nextSpeed, speedLabel } from "@/lib/media-time";

/**
 * <Audio src="/samples/call.mp3" title="Original voice" />: a player for voice
 * samples and recorded calls. A round play button, the title over a seek bar
 * with the elapsed and total time, 15-second skips, a speed toggle and mute.
 * <AudioGroup> sets two or more side by side, for before/after comparisons.
 *
 * Built on a hidden <audio> element, so it plays whatever the browser does
 * (MP3, M4A, WAV, Ogg) from /public or a URL. Starting one player pauses any
 * other on the page.
 */

const PLAY_EVENT = "ml-audio-play";

const Icon = {
  play: <path d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5Z" fill="currentColor" />,
  pause: <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" />,
  back: (
    <>
      <path d="M4 5v5h5" />
      <path d="M4.5 10a8 8 0 1 1 1.5 6" />
    </>
  ),
  fwd: (
    <>
      <path d="M20 5v5h-5" />
      <path d="M19.5 10a8 8 0 1 0-1.5 6" />
    </>
  ),
  vol: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="none" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  muted: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="none" />
      <path d="m16 9.5 5 5M21 9.5l-5 5" />
    </>
  ),
};

function Svg({ children, size = 18 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

export function Audio({
  src,
  title,
  caption,
}: {
  src: string;
  /** Shown above the seek bar, and names the player for screen readers. */
  title?: string;
  caption?: React.ReactNode;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);
  const [muted, setMuted] = useState(false);
  const name = title ?? "Audio";

  // The metadata can load before React attaches onLoadedMetadata, so read
  // what's already known once mounted.
  useEffect(() => {
    const a = ref.current;
    if (a && a.readyState >= 1 && Number.isFinite(a.duration)) setDuration(a.duration);
  }, []);

  // One player at a time: another one starting pauses this one.
  useEffect(() => {
    const onOther = (e: Event) => {
      if ((e as CustomEvent).detail !== ref.current) ref.current?.pause();
    };
    window.addEventListener(PLAY_EVENT, onOther);
    return () => window.removeEventListener(PLAY_EVENT, onOther);
  }, []);

  const audio = () => ref.current!;
  const toggle = () => {
    const a = audio();
    if (a.paused) {
      window.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: a }));
      void a.play();
    } else a.pause();
  };
  const skip = (by: number) => {
    const a = audio();
    a.currentTime = Math.min(Math.max(0, a.currentTime + by), a.duration || 0);
  };

  return (
    <figure className="ml-audio">
      <div className="ml-audio-player">
        <audio
          ref={ref}
          src={src}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        />
        <button type="button" className="ml-audio-play" onClick={toggle} aria-label={`${playing ? "Pause" : "Play"} ${name}`}>
          <Svg size={26}>{playing ? Icon.pause : Icon.play}</Svg>
        </button>
        <div className="ml-audio-main">
          {title && <div className="ml-audio-title">{title}</div>}
          <div className="ml-audio-bar">
            <span className="ml-audio-time">{formatTime(time)}</span>
            <input
              type="range"
              className="ml-audio-seek"
              min={0}
              max={duration || 0}
              step="any"
              value={Math.min(time, duration || 0)}
              onChange={(e) => {
                audio().currentTime = Number(e.target.value);
                setTime(Number(e.target.value));
              }}
              aria-label={`Seek ${name}`}
              aria-valuetext={`${formatTime(time)} of ${formatTime(duration)}`}
              style={{ "--pct": `${duration ? (time / duration) * 100 : 0}%` } as React.CSSProperties}
            />
            <span className="ml-audio-time">{formatTime(duration)}</span>
            <button
              type="button"
              className="ml-audio-btn"
              onClick={() => {
                audio().muted = !muted;
                setMuted(!muted);
              }}
              aria-label={muted ? `Unmute ${name}` : `Mute ${name}`}
              aria-pressed={muted}
            >
              <Svg>{muted ? Icon.muted : Icon.vol}</Svg>
            </button>
          </div>
          <div className="ml-audio-controls">
            <button type="button" className="ml-audio-btn" onClick={() => skip(-15)} aria-label="Back 15 seconds">
              <Svg>{Icon.back}</Svg>
            </button>
            <button
              type="button"
              className="ml-audio-btn ml-audio-rate"
              onClick={() => {
                const r = nextSpeed(rate);
                audio().playbackRate = r;
                setRate(r);
              }}
              aria-label={`Playback speed ${speedLabel(rate)}`}
            >
              {speedLabel(rate)}
            </button>
            <button type="button" className="ml-audio-btn" onClick={() => skip(15)} aria-label="Forward 15 seconds">
              <Svg>{Icon.fwd}</Svg>
            </button>
          </div>
        </div>
      </div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

/** Two or more players side by side, e.g. "Original" and "Isolated". Stacks on phones. */
export function AudioGroup({ children }: { children: React.ReactNode }) {
  return <div className="ml-audio-group">{children}</div>;
}
