import styles from "./CheckboxRow.module.css";

/**
 * A checkbox with its label, as one thing.
 *
 * The hand-written form was:
 *
 *     <label style={{ fontSize: "var(--pbui-fs-small)" }}>
 *       <input type="checkbox" checked={…} onChange={…} /> {scope}
 *     </label>
 *
 * — correct, because wrapping the input in the label associates the two without
 * needing an id. The reason to make it a component is not that the markup is
 * hard; it is that the association is invisible, so the next person writing one
 * in a hurry puts the label beside the input instead of around it and nothing
 * looks wrong.
 *
 * `onCheckedChange(next)` rather than `onChange(event)`, for the same reason as
 * TextInput: every call site wanted the boolean.
 */
export interface CheckboxRowProps {
  checked: boolean;
  onCheckedChange(checked: boolean): void;
  label: string;
  size?: "tiny" | "small";
  disabled?: boolean;
  /** Only when the label alone does not say what checking it does. */
  title?: string;
}

export function CheckboxRow({
  checked,
  onCheckedChange,
  label,
  size = "small",
  disabled = false,
  title,
}: CheckboxRowProps) {
  return (
    <label className={[styles.root, styles[size]].join(" ")} title={title}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onCheckedChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
