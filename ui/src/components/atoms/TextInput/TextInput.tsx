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
  width?: "narrow" | "normal" | "wide";
}

export function TextInput({
  value,
  onValueChange,
  label,
  type = "text",
  invalid = false,
  width = "normal",
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
      className={[styles.root, styles[width], invalid ? styles.invalid : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    />
  );
}
