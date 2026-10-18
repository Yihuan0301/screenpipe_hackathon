"use client";

/** Top-right powered-by mark for pitch bookends. */
export default function ScreenpipeBadge() {
  return (
    <a
      href="https://screenpi.pe"
      target="_blank"
      rel="noreferrer"
      className="absolute right-6 top-6 z-20 flex items-center gap-2 rounded-full border border-white/10 bg-zinc-950/55 px-2.5 py-1.5 backdrop-blur-sm transition hover:border-white/20 hover:bg-zinc-900/80 sm:right-10 sm:top-8 lg:right-14 lg:top-10"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/screenpipe-icon.ico"
        alt=""
        width={16}
        height={16}
        className="h-4 w-4 rounded-sm object-contain"
      />
      <span className="text-[11px] font-medium tracking-wide text-zinc-300">
        screenpipe
      </span>
    </a>
  );
}
