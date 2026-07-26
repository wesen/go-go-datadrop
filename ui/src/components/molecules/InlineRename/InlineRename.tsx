import styles from "./InlineRename.module.css";

/**
 * Rename in place: commit on Enter, discard on Escape, cancel on blur.
 *
 * **Uncontrolled, deliberately, and it is the reason this is not `TextInput`.**
 * The value is read once when Enter is pressed and never tracked; there is no
 * state to keep in sync because the edit either lands whole or does not happen.
 * A controlled field would add a `useState` per rename that exists only to be
 * thrown away, and would make Escape mean "put the old value back" rather than
 * "there was never an edit".
 *
 * That distinction survives a substitution pass: the DATADROP-6 phase 2 sweep
 * left this element raw for exactly this reason, and this component is where
 * the reason now lives.
 *
 * A blank name commits as `fallback` rather than as an empty string. A
 * workspace called "" is unreachable — there is nothing to click.
 */
export function InlineRename({
  initial,
  label,
  fallback,
  onCommit,
  onCancel,
}: {
  initial: string;
  label: string;
  /** Used when the field is committed empty or whitespace. */
  fallback: string;
  onCommit(name: string): void;
  onCancel(): void;
}) {
  return (
    <input
      defaultValue={initial}
      aria-label={label}
      className={styles.input}
      onBlur={onCancel}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          onCommit((event.target as HTMLInputElement).value.trim() || fallback);
        }
        if (event.key === "Escape") onCancel();
      }}
    />
  );
}
