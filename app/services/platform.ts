export type Platform = "mac" | "win" | "other";

export function platform(): Platform {
  if (import.meta.dev) {
    const p = new URLSearchParams(location.search).get("platform");
    if (p === "mac" || p === "win") return p;
  }
  const ua = navigator.userAgent;
  return /Macintosh|Mac OS X/.test(ua) ? "mac" : /Windows/.test(ua) ? "win" : "other";
}
