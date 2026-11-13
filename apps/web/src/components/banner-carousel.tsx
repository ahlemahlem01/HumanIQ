"use client";

import Link from "next/link";
import { mediaUrl } from "@/lib/api";
import { useEffect, useState } from "react";

export type BannerSlide = {
  id: string;
  kicker: string;
  title: string;
  body: string;
  /** SVG path (24x24 viewBox, stroke icon) shown in the tile on the right. */
  icon: string;
  /** Company logo shown in the tile instead of the icon (optional). */
  logoUrl?: string | null;
  primary?: { label: string; href: string };
  secondary?: { label: string; href: string };
};

/**
 * Auto-advancing banner. Each slide lasts `interval` ms; the progress bar of the active
 * slide drives the advance (so pausing the animation pauses the carousel).
 * Pauses on hover and keyboard focus, has a pause button, and does not autoplay
 * when the visitor prefers reduced motion.
 */
export function BannerCarousel({
  slides,
  interval = 6000,
  compact = false,
  label = "À la une",
}: {
  slides: BannerSlide[];
  interval?: number;
  /** Smaller type and padding, for banners placed above a dense page. */
  compact?: boolean;
  label?: string;
}) {
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const paused = userPaused || hovering || reduced;
  const count = slides.length;
  const current = Math.min(index, count - 1);

  function next() {
    setIndex((value) => (value + 1) % count);
  }

  return (
    <section
      aria-roledescription="carousel"
      aria-label={label}
      className={`relative overflow-hidden bg-forest text-white ${compact ? "rounded-2xl" : "rounded-3xl"}`}
      onPointerEnter={() => setHovering(true)}
      onPointerLeave={() => setHovering(false)}
      onFocus={() => setHovering(true)}
      onBlur={() => setHovering(false)}
    >
      <div className={`grid ${compact ? "p-5 pb-12 md:p-6 md:pb-12" : "p-8 pb-16 md:p-10 md:pb-16"}`} aria-live={paused ? "polite" : "off"}>
        {slides.map((slide, position) => {
          const active = position === current;
          return (
            <div
              key={slide.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${position + 1} sur ${count}`}
              aria-hidden={!active}
              inert={!active}
              className={`col-start-1 row-start-1 flex items-center justify-between gap-8 transition-all duration-700 ease-out motion-reduce:transition-none ${
                active ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-6 opacity-0"
              }`}
            >
              <div className="min-w-0">
                <p className={`font-medium text-white/80 ${compact ? "text-xs" : "text-sm"}`}>{slide.kicker}</p>
                <h2 className={`max-w-xl tracking-tight ${compact ? "mt-1 text-xl font-semibold leading-snug" : "mt-2 text-3xl font-bold leading-tight"}`}>{slide.title}</h2>
                <p className={`max-w-lg text-white/80 ${compact ? "mt-1 text-sm leading-5" : "mt-2"}`}>{slide.body}</p>
                {slide.primary || slide.secondary ? (
                  <div className={`flex flex-wrap ${compact ? "mt-4 gap-2" : "mt-6 gap-3"}`}>
                    {slide.primary ? (
                      <Link href={slide.primary.href} className={`rounded-full bg-white font-semibold text-[#0b1f4b] transition hover:scale-[1.03] active:scale-95 ${compact ? "px-4 py-2 text-xs" : "px-6 py-3 text-sm"}`}>
                        {slide.primary.label}
                      </Link>
                    ) : null}
                    {slide.secondary ? (
                      <Link href={slide.secondary.href} className={`rounded-full border border-white/40 font-semibold text-white transition hover:bg-white/10 active:scale-95 ${compact ? "px-4 py-2 text-xs" : "px-6 py-3 text-sm"}`}>
                        {slide.secondary.label}
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div
                className={`hidden shrink-0 items-center justify-center bg-white/10 md:flex ${compact ? "h-20 w-20 rounded-2xl" : "h-32 w-32 rounded-3xl"} ${
                  active ? "animate-[bannerFloat_5s_ease-in-out_infinite] motion-reduce:animate-none" : ""
                }`}
                aria-hidden
              >
                {slide.logoUrl ? (
                  <span className={`flex items-center justify-center overflow-hidden bg-white ${compact ? "h-14 w-14 rounded-xl" : "h-24 w-24 rounded-2xl"}`}>
                    <img src={mediaUrl(slide.logoUrl)} alt="" className="h-full w-full object-contain" />
                  </span>
                ) : (
                  <svg viewBox="0 0 24 24" className={compact ? "h-9 w-9" : "h-14 w-14"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d={slide.icon} />
                  </svg>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className={`absolute inset-x-0 bottom-0 flex items-center gap-3 ${compact ? "px-5 pb-3 md:px-6" : "px-8 pb-5 md:px-10"}`}>
        <div className="flex flex-1 items-center gap-2" role="tablist" aria-label="Choisir une diapositive">
          {slides.map((slide, position) => (
            <button
              key={slide.id}
              type="button"
              role="tab"
              aria-selected={position === current}
              aria-label={`Diapositive ${position + 1} : ${slide.title}`}
              onClick={() => setIndex(position)}
              className="group relative h-4 w-full max-w-[72px] focus-visible:outline-none"
            >
              <span className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/25 transition-all group-hover:h-1.5 group-focus-visible:ring-2 group-focus-visible:ring-white">
                {position < current || (position === current && reduced) ? (
                  <span className="block h-full w-full bg-white" />
                ) : position === current ? (
                  <span
                    key={`${current}-${slide.id}`}
                    className="block h-full bg-white"
                    style={{
                      animation: `bannerProgress ${interval}ms linear forwards`,
                      animationPlayState: paused ? "paused" : "running",
                    }}
                    onAnimationEnd={next}
                  />
                ) : null}
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setUserPaused((value) => !value)}
          aria-label={userPaused ? "Reprendre le défilement automatique" : "Mettre en pause le défilement automatique"}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25 active:scale-90"
        >
          {userPaused ? (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
              <path d="M7 5h3v14H7zM14 5h3v14h-3z" />
            </svg>
          )}
        </button>
      </div>
    </section>
  );
}
