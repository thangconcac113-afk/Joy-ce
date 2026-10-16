/** Hashtags are case-insensitive; full-width characters use their standard form. */
export function normalizeHashtag(value: string): string {
  const tag = value.normalize("NFKC").trim().replace(/^#/, "").toLowerCase();
  return /^[\p{L}\p{N}_]{1,100}$/u.test(tag) ? tag : "";
}
export function extractHashtags(...values: (string | null | undefined)[]): string[] {
  const tags = new Set<string>();
  for (const value of values) for (const match of (value || "").normalize("NFKC").matchAll(/#([\p{L}\p{N}_]+)/gu)) {
    const tag = normalizeHashtag(match[1]); if (tag) tags.add(tag);
  }
  return [...tags];
}
