import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

function prefersReducedMotion() {
  try {
    return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

// play() returns a promise in modern browsers (rejected when autoplay is blocked) but undefined in
// older ones and in jsdom, so never chain on it directly.
function safePlay(el) {
  try {
    const p = el?.play?.();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch {
    /* autoplay blocked: the poster and play button stay visible */
  }
}

/* Looping demonstration clip for one exercise: the full rep, start to finish, on repeat.
   Nothing is downloaded until the clip is close to the viewport (preload="none" + an
   IntersectionObserver), it pauses again when scrolled away, and people who ask for reduced motion
   get the still poster with a play button instead of autoplay. If the clip fails to load, the
   caller's fallback (the old figure or "coming soon") is rendered instead of a broken player. */
export function ExerciseDemo({ media, size = 240, fallback = null }) {
  const videoRef = useRef(null);
  const [near, setNear] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reduced] = useState(prefersReducedMotion);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNear(true);
          if (!reduced && el.currentSrc) safePlay(el);
        } else {
          el.pause?.();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced, failed]);

  // <source> children are only added once the clip is near the viewport, and a <video> doesn't
  // notice new sources by itself, so load them explicitly.
  useEffect(() => {
    const el = videoRef.current;
    if (!near || !el) return;
    el.load?.();
    if (!reduced) safePlay(el);
  }, [near, reduced]);

  if (!media || failed) return fallback;

  const toggle = () => {
    const el = videoRef.current;
    if (!el) return;
    setNear(true);
    if (el.paused) safePlay(el);
    else el.pause?.();
  };

  return (
    <div style={{ position: "relative", width: "100%", maxWidth: size, aspectRatio: "1 / 1", margin: "0 auto", borderRadius: 10, overflow: "hidden", background: "var(--bg-elev2)" }}>
      <video
        ref={videoRef}
        aria-label={media.alt}
        poster={media.poster}
        muted
        loop
        playsInline
        autoPlay={!reduced}
        preload="none"
        width={size}
        height={size}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => setFailed(true)}
        style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
      >
        {near && <source src={media.webm} type="video/webm" />}
        {near && <source src={media.mp4} type="video/mp4" onError={() => setFailed(true)} />}
      </video>
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause demonstration" : "Play demonstration"}
        style={{
          position: "absolute", right: 8, bottom: 8, width: 36, height: 36, borderRadius: 18,
          border: "none", background: "rgba(10,18,14,0.55)", color: "#fff", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </button>
    </div>
  );
}
