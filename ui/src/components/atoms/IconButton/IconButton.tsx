import type { ButtonHTMLAttributes } from "react";
import type { ButtonSize, ButtonTone, ButtonVariant } from "../Button";
import styles from "./IconButton.module.css";

/**
 * A button whose label is a glyph.
 *
 * `label` is required, and that is the entire reason this is a separate atom
 * rather than `<Button>✕</Button>`. A glyph-only button has no accessible name:
 * a screen reader announces "button" and stops. Every hand-written one in the
 * tree happens to carry an `aria-label` — `move up`, `clear x`, `remove step` —
 * but that is six authors remembering six times, and the seventh is the bug.
 * Making it a required prop moves the guarantee from discipline to the type
 * checker.
 *
 * The glyphs in use: ↑ ↓ ✕ × ⌖ ↕. They are text, not icons — there is no icon
 * font and no SVG sprite, which is why this renders a character rather than
 * taking a component.
 */
export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "aria-label"> {
  glyph: string;
  /** Becomes `aria-label` and `title`. Say the verb: "remove step", not "x". */
  label: string;
  variant?: ButtonVariant;
  tone?: ButtonTone;
  size?: ButtonSize;
}

export function IconButton({
  glyph,
  label,
  variant = "bare",
  tone = "default",
  size = "small",
  className,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={[
        styles.root,
        styles[variant],
        styles[size],
        tone === "danger" ? styles.danger : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      <span aria-hidden="true">{glyph}</span>
    </button>
  );
}
