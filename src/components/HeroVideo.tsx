import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Full-bleed background video for hero sections.
 *
 * Preferred source is a self-hosted MP4 rendered with a native <video> element:
 * no player chrome, no play button, instant muted autoplay. Drop the file in
 * `public/videos/` (default: `/videos/hero.mp4`) — see public/videos/README.txt.
 *
 * If the MP4 cannot be loaded (file not uploaded yet), we fall back to the
 * YouTube embed for `videoId` so the hero never renders broken.
 */
// Public MP4 for the hero (e.g. on the Strato webspace). Set VITE_HERO_VIDEO_URL
// in .env; falls back to a file in public/videos/.
const DEFAULT_HERO_SRC: string =
  (import.meta.env.VITE_HERO_VIDEO_URL as string | undefined) || "/videos/hero.mp4";

export function HeroVideo({
  src = DEFAULT_HERO_SRC,
  loopEnd,
  videoId = "ziIY8TEltSo",
  variant = "default",
}: {
  /** Path/URL of a self-hosted MP4 (H.264). Defaults to VITE_HERO_VIDEO_URL or /videos/hero.mp4 */
  src?: string;
  /** Loop only the first N seconds of the clip (restart at 0 when reached). */
  loopEnd?: number;
  /** YouTube video id, only used as a fallback when `src` fails to load. */
  videoId?: string;
  variant?: "default" | "store";
}) {
  // Remember which src failed; a new src automatically retries the native path.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const useFallback = failedSrc === src;
  const onFail = useCallback(() => setFailedSrc(src), [src]);

  return (
    <div className="video-background absolute inset-0 overflow-hidden bg-[#0A0F18]">
      {useFallback ? (
        <YouTubeHero videoId={videoId} />
      ) : (
        <NativeHero key={src} src={src} loopEnd={loopEnd} onFail={onFail} />
      )}

      {/* Click blocker */}
      <div className="absolute inset-0 z-[1]" aria-hidden="true" />

      {/* Minimal grade — keep video clearly visible */}
      {variant === "store" ? null : (
        <>
          {/* soft left fade so hero text stays legible */}
          <div
            className="absolute inset-0 z-[2]"
            style={{
              background:
                "linear-gradient(90deg, rgba(12,12,13,0.55) 0%, rgba(12,12,13,0.15) 45%, transparent 70%)",
            }}
          />
          {/* bottom fade into page background */}
          <div className="absolute inset-0 z-[2] hero-grad-bottom" />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Native <video> — the real thing                                     */
/* ------------------------------------------------------------------ */

function NativeHero({
  src,
  loopEnd,
  onFail,
}: {
  src: string;
  /** Restart from 0 once playback reaches this many seconds (partial loop). */
  loopEnd?: number;
  onFail: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  // Content first, video second: the clip only starts downloading once the
  // page itself (HTML, CSS, fonts, product images, API data) has finished
  // loading. A large background video otherwise saturates the connection and
  // makes everything else on the page appear slow.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (document.readyState === "complete") {
      setReady(true);
      return;
    }
    const onLoad = () => setReady(true);
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  // Partial loop: jump back to the start as soon as `loopEnd` is reached.
  useEffect(() => {
    const v = ref.current;
    if (!v || !loopEnd || loopEnd <= 0) return;
    const onTime = () => {
      if (v.currentTime >= loopEnd) v.currentTime = 0;
    };
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, [src, loopEnd]);

  useEffect(() => {
    const v = ref.current;
    if (!v || !ready) return;

    // Media `error` events don't bubble; listen on the element directly.
    v.addEventListener("error", onFail);
    if (v.error) onFail();

    // Muted autoplay is allowed everywhere, but nudge playback explicitly in
    // case the browser deferred it (e.g. tab restored in the background).
    v.muted = true;
    const p = v.play();
    if (p && typeof p.catch === "function") p.catch(() => {});

    return () => v.removeEventListener("error", onFail);
  }, [ready, src, onFail]);

  return (
    <video
      ref={ref}
      src={ready ? src : undefined}
      autoPlay
      muted
      loop
      playsInline
      preload={ready ? "auto" : "none"}
      disablePictureInPicture
      disableRemotePlayback
      aria-hidden="true"
      tabIndex={-1}
      onError={onFail}
      className="pointer-events-none absolute inset-0 h-full w-full object-cover"
    />
  );
}

/* ------------------------------------------------------------------ */
/* YouTube fallback (used only while no MP4 is available)              */
/* ------------------------------------------------------------------ */

type YTPlayer = {
  playVideo?: () => void;
  mute?: () => void;
  getPlayerState?: () => number;
  seekTo?: (seconds: number, allowSeekAhead: boolean) => void;
};

declare global {
  interface Window {
    YT?: {
      Player: new (el: Element | string, opts: unknown) => YTPlayer;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

// YouTube player states
const ENDED = 0;
const PLAYING = 1;
const BUFFERING = 3;

let apiPromise: Promise<void> | null = null;
function loadYouTubeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<void>((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
  return apiPromise;
}

function YouTubeHero({ videoId }: { videoId: string }) {
  // No loop/playlist params on purpose: the playlist parameter is what makes
  // YouTube draw the prev/pause/next control cluster. We loop via the API.
  const src = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&disablekb=1&fs=0&iv_load_policy=3&playsinline=1&enablejsapi=1`;

  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Only visible while genuinely PLAYING — in every other state YouTube draws
  // its play button / poster, so the wrapper stays hidden (dark hero).
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let poll: number | null = null;
    let wasPlaying = false;
    setVisible(false);

    loadYouTubeApi().then(() => {
      if (cancelled || !iframeRef.current || !window.YT) return;

      const force = (p: YTPlayer) => {
        p.mute?.();
        p.playVideo?.();
      };

      const sync = (p: YTPlayer, state: number | undefined) => {
        if (cancelled) return;
        if (state === PLAYING) {
          wasPlaying = true;
          setVisible(true);
          return;
        }
        if (state === BUFFERING && wasPlaying) return;
        if (state === ENDED) p.seekTo?.(0, true);
        setVisible(false);
        force(p);
      };

      const player = new window.YT.Player(iframeRef.current, {
        events: {
          onReady: (e: { target: YTPlayer }) => force(e.target),
          onStateChange: (e: { data: number; target: YTPlayer }) => sync(e.target, e.data),
        },
      });

      poll = window.setInterval(() => sync(player, player.getPlayerState?.()), 500);
    });

    return () => {
      cancelled = true;
      if (poll) window.clearInterval(poll);
    };
  }, [videoId]);

  return (
    <div
      className="absolute inset-0 transition-opacity duration-500 ease-out"
      style={{ opacity: visible ? 1 : 0 }}
      aria-hidden="true"
    >
      <iframe
        ref={iframeRef}
        src={src}
        title="background"
        frameBorder={0}
        allow="autoplay; encrypted-media"
        tabIndex={-1}
        className="pointer-events-none absolute left-1/2 top-1/2"
        style={{
          width: "100vw",
          height: "56.25vw",
          minHeight: "100vh",
          minWidth: "177.77vh",
          transform: "translate(-50%, -50%) scale(1.25)",
        }}
      />
    </div>
  );
}
