import { useRef, useState } from "react";
import { Stack, Toolbar } from "../../layout";
import { Text } from "../../foundation";
import { Button } from "../../atoms";
import styles from "./FileDropZone.module.css";

/**
 * Where files come in.
 *
 * Two affordances, and both are necessary. A drop target alone assumes a mouse,
 * a window arrangement that lets you see the file manager and the browser at
 * once, and the knowledge that the surface is droppable at all — none of which
 * a keyboard user has. The button assumes none of them, and it is the one a
 * screen reader reaches.
 *
 * Holds the only `<input type="file">` in the tree. It is `hidden` rather than
 * styled-invisible: a hidden input is out of the tab order, which is correct,
 * because the button in front of it is the tab stop and clicking that opens the
 * picker.
 *
 * `disabledReason` rather than a bare `disabled`, because "choose a drop and
 * name the dataset first" is the entire content of the disabled state. A greyed
 * box with no sentence is a puzzle.
 */
export function FileDropZone({
  onFiles,
  disabled = false,
  disabledReason,
  accept,
  label = "drop files here, or click to choose",
  buttonLabel = "Choose files…",
}: {
  onFiles(files: FileList): void;
  disabled?: boolean;
  /** Shown instead of `label` when disabled. Say what to do, not what is wrong. */
  disabledReason?: string;
  accept?: string;
  label?: string;
  buttonLabel?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const open = () => {
    if (!disabled) input.current?.click();
  };

  return (
    <Stack gap={2} data-part="file-drop-zone">
      <Toolbar tight>
        <Button disabled={disabled} onClick={open} data-testid="choose-files">
          {buttonLabel}
        </Button>
        <Text size="tiny" tone="faint">
          or drop them below
        </Text>
      </Toolbar>

      <div
        className={[styles.zone, dragging ? styles.dragging : "", disabled ? styles.disabled : ""]
          .filter(Boolean)
          .join(" ")}
        data-state={dragging ? "acceptable" : undefined}
        data-testid="drop-zone"
        onDragOver={(event) => {
          if (disabled) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled) onFiles(event.dataTransfer.files);
        }}
        onClick={open}
      >
        <Text size="small" tone={disabled ? "faint" : undefined}>
          {disabled ? (disabledReason ?? label) : label}
        </Text>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          aria-label="files to upload"
          accept={accept}
          onChange={(event) => {
            if (event.target.files) onFiles(event.target.files);
          }}
        />
      </div>
    </Stack>
  );
}
