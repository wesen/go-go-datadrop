import type { SelectHTMLAttributes } from "react";
import styles from "./SelectInput.module.css";

/**
 * A dropdown over a closed set.
 *
 * Nine hand-written `<select>` elements, in three different inline styles:
 * `{ font: "inherit" }` in UploadApp and TokensApp,
 * `{ font: "inherit", fontSize: "var(--pbui-fs-tiny)" }` twice in MemberList,
 * and unstyled elsewhere. The divergence is the same story as the buttons
 * (guide §7.2) at smaller scale.
 *
 * `options` is data rather than children, which is what lets a story render
 * every state of this control without JSX gymnastics — and what stops a caller
 * putting anything other than an `<option>` inside a `<select>`, which browsers
 * handle in six different ways.
 *
 * `placeholder` renders as a disabled-looking empty-valued option, reproducing
 * the "choose a drop…" entry UploadApp writes by hand. It is deliberately
 * selectable: the upload form treats "no drop chosen" as a real state that
 * disables the surface below it, and making the option unselectable would strand
 * anyone who wanted to get back to it.
 */
export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectInputProps
  extends Omit<
    SelectHTMLAttributes<HTMLSelectElement>,
    "onChange" | "value" | "children" | "size" | "aria-label"
  > {
  value: string;
  onValueChange(value: string): void;
  /** Becomes `aria-label`. */
  label: string;
  options: readonly SelectOption[];
  /** Shown as the empty-valued first entry. */
  placeholder?: string;
  /**
   * The same pair Button has, and for the same reason: the codebase already
   * contains both. UploadApp, TokensApp, MemberList and the shell leave the
   * native chrome alone; SourceApp draws a hairline border and a pane
   * background around it, matching the text fields beside it.
   */
  variant?: "native" | "framed";
  size?: "tiny" | "small";
  /**
   * `compact` is PipelineApp's step editor, which caps its selects at 60-90px
   * so that a whole step reads as one line. Everything else takes the default.
   */
  width?: "auto" | "compact";
}

export function SelectInput({
  value,
  onValueChange,
  label,
  options,
  placeholder,
  variant = "native",
  size = "small",
  width = "auto",
  className,
  ...rest
}: SelectInputProps) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      className={[styles.root, styles[variant], styles[size], styles[width], className ?? ""]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
