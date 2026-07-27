import type { TextareaHTMLAttributes } from "react";
import styles from "./TextArea.module.css";

/**
 * A multi-line text field.
 *
 * The only one in the tree, and the reason it is an atom rather than a raw
 * `<textarea>` in `BundleDialog` is `test/no-raw-controls.test.ts`, which
 * forbids one outside `atoms/` and is right to: the same argument that produced
 * `TextInput` — four character-identical inline style objects written within
 * hours of each other — applies the moment there is a second multi-line field.
 *
 * It follows `TextInput` exactly, including the two API choices worth
 * restating: `label` is required and becomes `aria-label`, because a bare field
 * in a dialog has no visible label to associate with; and
 * `onValueChange(value)` unwraps the event, because every call site wants the
 * string.
 *
 * `rows` rather than a height token: a text area's height is measured in lines
 * of its own content, and that is exactly what the attribute means.
 */
export interface TextAreaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value" | "aria-label"> {
  value: string;
  onValueChange(value: string): void;
  /** Becomes `aria-label`. Say what the field holds. */
  label: string;
  /** Marks the content as failing validation; sets `aria-invalid`. */
  invalid?: boolean;
  /** Lines of visible content. 8 is the import dialog's. */
  rows?: number;
  /**
   * Monospace and pre-wrapped, for JSON.
   *
   * The whole interface is monospace already, so this exists for the wrapping:
   * a bundle is one very long line, and a field that does not wrap it shows the
   * user a single character of their own paste.
   */
  code?: boolean;
}

export function TextArea({
  value,
  onValueChange,
  label,
  invalid = false,
  rows = 8,
  code = false,
  className,
  ...rest
}: TextAreaProps) {
  return (
    <textarea
      aria-label={label}
      aria-invalid={invalid || undefined}
      value={value}
      rows={rows}
      spellCheck={false}
      onChange={(event) => onValueChange(event.target.value)}
      className={[
        styles.root,
        code ? styles.code : "",
        invalid ? styles.invalid : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    />
  );
}
