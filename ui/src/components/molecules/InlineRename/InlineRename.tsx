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
      /*
       * Focused on mount, and it is not a convenience.
       *
       * The component only ever mounts in response to a deliberate "rename
       * this" gesture, so there is no case where focus arrives unasked — the
       * objection autofocus normally attracts. Without it the field appears
       * where a name was and does nothing until the user clicks it a second
       * time, which reads as a broken control; and `onBlur={onCancel}` means an
       * unfocused field can never be cancelled by clicking away either, so it
       * sits there until something else re-renders.
       *
       * Found by clicking a tile title in DATADROP-8, where the rename is the
       * default verb rather than a double-click and the missing focus is
       * therefore immediate.
       */
      // biome-ignore lint/a11y/noAutofocus: see above — this element exists only as the direct result of a rename gesture, and focus is what the gesture asked for.
      autoFocus
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
