import type { UploadState } from "../../../pbui";
import styles from "./StateGlyph.module.css";

/**
 * A state, carried by a character rather than by a colour.
 *
 * The upload queue distinguished queued / hashing / sending / done / failed with
 * a word inside a faint-coloured span. That fails the rule `Chip.module.css`
 * states first and best: meaning is never carried by colour alone (WCAG 1.4.1),
 * and a faint grey word is barely carrying it by anything.
 *
 * The glyph is the primary signal, the `title` is the accessible one, and the
 * colour is reinforcement. Print the queue in greyscale and ✓, ✕ and · are still
 * three different things.
 */
export type GlyphState = UploadState | "ok" | "error" | "pending";

const GLYPH: Record<GlyphState, string> = {
  queued: "·",
  hashing: "◇",
  mounting: "◈",
  sending: "◐",
  done: "✓",
  failed: "✕",
  ok: "✓",
  error: "✕",
  pending: "·",
};

const TONE: Partial<Record<GlyphState, string>> = {
  done: "ok",
  ok: "ok",
  failed: "danger",
  error: "danger",
};

export function StateGlyph({ state, label }: { state: GlyphState; label?: string }) {
  const tone = TONE[state];
  return (
    <span
      className={[styles.glyph, tone ? styles[tone] : ""].filter(Boolean).join(" ")}
      title={label ?? state}
      role="img"
      aria-label={label ?? state}
    >
      {GLYPH[state]}
    </span>
  );
}
