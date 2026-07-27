/**
 * Value formatting, for anything that has to render a number a human reads.
 *
 * In `model/` because it belongs to no layer above it: it is pure, it touches
 * no DOM, and — the reason it moved here — a molecule needs it and
 * `components/molecules` may not import `apps`. It lived in
 * `apps/UploadApp/upload.ts` because the uploader was the first thing to need
 * it, which is the ordinary way a shared helper ends up in the wrong place.
 */

/**
 * Bytes at any scale, readable at a glance.
 *
 * One decimal below ten and none above, so a column of sizes has a stable
 * width: "9.4 MB" and "412 MB" are both six characters, and "9.44 MB" beside
 * "412.19 MB" is not something anyone scans successfully.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["kB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

/**
 * Clamp `value` into [lo, hi].
 *
 * Here rather than private to a module because three of DATADROP-11's widgets
 * take a caller-supplied fraction straight into CSS geometry, and a fraction
 * arriving as 1.4 or NaN must produce a wrong-looking bar rather than a broken
 * layout. `model/plot.ts` had its own copy; it now imports this one.
 */
export function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

/**
 * Short number: 847 → "847", 1 240 → "1.2k", 18 200 → "18k", 1 400 000 → "1.4M".
 *
 * The one-decimal cutoff moves at 10k, not at 1k. "18.2k" reads as false
 * precision on a scale whose whole point is approximation, while "1.2k" carries
 * real information because the alternative rounds away a fifth of the value.
 *
 * Non-finite input returns "—" rather than "NaN". A tile showing NaN looks
 * broken; a dash looks empty, which is what it is. This matters more than it
 * sounds: every caller here is dividing, and one of them is dividing by a
 * budget that is zero before the first event arrives.
 */
export function kfmt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(n));
}

/**
 * Short duration from milliseconds: 420 → "420ms", 1 400 → "1.4s",
 * 92 000 → "2m", 7 200 000 → "2.0h".
 *
 * Minutes round to whole numbers because a tenth of a minute is a unit nobody
 * reads. Seconds and hours keep one decimal, because the next unit up is 60×
 * away and dropping the decimal there loses too much.
 */
export function msfmt(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  if (ms >= 3_600_000) return `${(ms / 3_600_000).toFixed(1)}h`;
  if (ms >= 60_000) return `${Math.round(ms / 60_000)}m`;
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

/**
 * A fraction as whole percent: 0.7614 → "76%".
 *
 * Never a decimal. A meter reading "76.1%" invites the reader to believe the
 * underlying number is that precise, and in every current caller it is a ratio
 * of two estimates.
 */
export function pctfmt(fraction: number): string {
  if (!Number.isFinite(fraction)) return "—";
  return `${Math.round(fraction * 100)}%`;
}
