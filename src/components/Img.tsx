"use client";

import { useState } from "react";

/** External image (YouTube/TikTok CDN) that falls back to an empty placeholder if it fails to load. */
export function Img({ src, className, alt = "" }: { src: string | null; className?: string; alt?: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return <span className={className} aria-hidden />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={className} src={src} alt={alt} loading="lazy" onError={() => setBroken(true)} />;
}
