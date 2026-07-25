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
