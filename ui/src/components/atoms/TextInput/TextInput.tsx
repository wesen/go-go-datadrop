import type { InputHTMLAttributes } from "react";
import styles from "./TextInput.module.css";

/**
 * A single-line text field.
 *
 * This exact style object appeared four times, character-identical:
 *
 *     style={{ font: "inherit", padding: "2px 4px", border: "var(--pbui-border-hair)" }}
 *
 * in UploadApp (the dataset name), TokensApp (the token name), MemberList (the
 * invitee's email) and SignInApp (the bearer token) — all four written during
 * DATADROP-5 within hours of each other by one author. Duplication does not
 * need a large team or a long time; it needs only that there be nothing to
 * import (guide §7.3).
 *
 * Two API choices worth stating:
 *
 *   - `label` is required and becomes `aria-label`. Every one of the four had
 *     one, because a bare input in a toolbar has no visible label to associate
 *     with. Requiring it keeps that true.
 *   - `onValueChange(value)` rather than `onChange(event)`. Every call site
 *     wanted the string; making the component unwrap it removes four chances
 *     to forget `.target.value`.
 */
export interface TextInputProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "onChange" | "value" | "type" | "size" | "aria-label"
  > {
  value: string;
  onValueChange(value: string): void;
  /** Becomes `aria-label`. Say what the field holds. */
  label: string;
  type?: "text" | "password" | "email" | "search";
  /** Marks the field as failing validation; sets `aria-invalid`. */
  invalid?: boolean;
  /**
   * Every value here is a width some call site actually asked for:
   * `auto` (the browser default, used by the four DATADROP-5 fields),
   * `narrow` (64px, ChartsApp's document name, which sits in a wrapping row of
   * chips), `compact` (96px, PipelineApp's step-editor fields, which have to
   * keep a step on one line), and `fill` (SourceApp's token field, which takes
   * the rest of a toolbar). Inventing a small-medium-large scale nothing asks
   * for is how a component becomes a styling API (§20.3).
   */
  width?: "auto" | "narrow" | "compact" | "fill";
  /**
   * `base` (11.5px) is `font: inherit` from the body, which is what the four
   * DATADROP-5 fields got. ChartsApp asked for `small` and SourceApp for
   * `tiny`, explicitly. All three sizes predate this component.
   */
  size?: "base" | "small" | "tiny";
}

export function TextInput({
  value,
  onValueChange,
  label,
  type = "text",
  invalid = false,
  width = "auto",
  size = "base",
  className,
  ...rest
}: TextInputProps) {
  return (
    <input
      type={type}
      aria-label={label}
      aria-invalid={invalid || undefined}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      className={[
        styles.root,
        styles[width],
        styles[size],
        invalid ? styles.invalid : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    />
  );
}
