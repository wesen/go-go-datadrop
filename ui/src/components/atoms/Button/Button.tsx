import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";

/**
 * Every clickable verb in the workbench.
 *
 * There were 42 hand-written `<button>` elements before this existed, in two
 * visual treatments that nobody had named:
 *
 *   - **bare** — the majority. `reset.css` strips background, border and
 *     padding from every button, so `<button><Text size="small">Commit</Text></button>`
 *     renders as plain text with a pointer cursor. All of DATADROP-5's
 *     buttons look like this.
 *   - **framed** — the six copies of `const btn: React.CSSProperties` in the
 *     chart applications: hairline border, alt background, bold.
 *   - **raised** — a firm border, the hard shadow, and a tone fill.
 *     LauncherApp, WatchlistApp and the tutorials. This is the treatment
 *     `tokens.css` anticipated: `--pbui-shadow-hard` is documented there as
 *     "buttons", and until now nothing named it.
 *
 * The six framed copies were identical except for `fontSize` — three used
 * 9.5px and three used 10.5px, which is a divergence nobody chose (guide §7.2).
 * That is why `size` is an explicit prop rather than a constant: the choice is
 * now one reviewable word instead of six independent accidents.
 */

export type ButtonVariant = "bare" | "framed" | "raised";
export type ButtonTone = "default" | "danger";
export type ButtonSize = "tiny" | "small";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  variant?: ButtonVariant;
  tone?: ButtonTone;
  size?: ButtonSize;
  /**
   * Pressed or toggled. Sets `aria-pressed`, so callers cannot forget it —
   * half of them did when this was written by hand.
   */
  selected?: boolean;
  /** Replaces the label and disables, for "minting…" and its relatives. */
  busy?: string;
  /**
   * The fill of a `raised` button, as a CSS variable reference.
   *
   * A string rather than an enum, and the same shape as `Chip`'s `tone`, for
   * the same reason: LauncherApp fills each button with the tone of the
   * application it launches, which is data, not a design choice made here.
   * Ignored by the other variants.
   */
  fill?: string;
  /** `submit` only inside a real `<form>`. Everything here is `button`. */
  type?: "button" | "submit";
  children?: ReactNode;
}

export function Button({
  variant = "bare",
  tone = "default",
  size = "small",
  selected = false,
  busy,
  fill,
  type = "button",
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      // eslint-disable-next-line react/button-has-type -- the union above is the guard
      type={type}
      disabled={disabled || busy !== undefined}
      aria-pressed={selected || undefined}
      style={variant === "raised" && fill ? { background: fill } : undefined}
      className={[
        styles.root,
        styles[variant],
        styles[size],
        tone === "danger" ? styles.danger : "",
        selected ? styles.selected : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {busy ?? children}
    </button>
  );
}
