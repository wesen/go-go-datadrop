import { useMemo, useState } from "react";
import {
  describeBundle,
  measureBundle,
  parseBundle,
  unknownApps,
  type BundleKind,
} from "../../../model/portable";
import { Text } from "../../foundation";
import { Stack } from "../../layout";
import { Button, TextArea } from "../../atoms";
import { Dialog } from "../Dialog";
import styles from "./BundleDialog.module.css";

/**
 * Import a tile, a workspace or a stage from a bundle.
 *
 * A **text area**, not a "read the clipboard" button (DR-67). Firefox does not
 * implement `navigator.clipboard.readText` for web content at all — there is no
 * permission to request and no flag to pass — so a flow built on it does not
 * exist for a large share of users, and the failure is a rejected promise inside
 * a click handler, which looks like a button that does nothing.
 *
 * So the empty, focused field IS the path, and the prefill is an optimisation
 * the caller performs before opening this: `beginImport` reads the clipboard, and
 * prefills only when the content parses as a bundle **of the expected kind**.
 * That last condition is a *relevance* check, not merely a validity one — a
 * clipboard holding a paragraph of prose must not produce a dialog prefilled
 * with a paragraph of prose the user then has to select and delete.
 *
 * ## The confirm button is never enabled for content that would fail
 *
 * `parseBundle` re-runs on every keystroke, which is cheap at these sizes and
 * means **the user can never press a button that then reports an error**. Same
 * principle as `CHANNEL_ACCEPTS` filtering the channel dropdown rather than the
 * plot engine rejecting the selection afterwards.
 *
 * ## Unknown applications warn; they do not block
 *
 * A bundle from a build with an application yours lacks imports anyway, with
 * those tiles naming the missing application — `Tile` already renders "no
 * application called 'chartsy' — choose one above". Importing four tiles with
 * one the reader cannot fill is true; importing three is a lie about what their
 * colleague sent.
 */
export interface BundleDialogProps {
  /** What the target will accept. Anything else is refused by name. */
  kind: BundleKind;
  /** Prefilled text, or "" for the empty path. */
  initial: string;
  /** Where the prefill came from, for the line above the field. */
  from: "clipboard" | "template" | null;
  /** Application ids this build has, for the unknown-application warning. */
  knownApps: ReadonlySet<string>;
  onCancel(): void;
  /** Called with the text. Only reachable while the text parses. */
  onConfirm(text: string): void;
  /** Shown when the caller refused what this dialog accepted. */
  error?: string | null;
}

const CONFIRM: Record<BundleKind, string> = {
  tile: "Replace tile",
  workspace: "Add workspace",
  stage: "Add stage",
};

const TITLE: Record<BundleKind, string> = {
  tile: "Replace this tile from a bundle",
  workspace: "Add a workspace from a bundle",
  stage: "Add a stage from a bundle",
};

export function BundleDialog({
  kind,
  initial,
  from,
  knownApps,
  onCancel,
  onConfirm,
  error,
}: BundleDialogProps) {
  const [text, setText] = useState(initial);

  // Re-parsed on every keystroke. At 512 kB worst case and a few kB typical
  // this is well under a frame, and it is what lets the confirm button be
  // honest about whether it will work.
  const result = useMemo(() => parseBundle(text, kind), [text, kind]);
  const missing = useMemo(
    () => (result.ok ? unknownApps(result.bundle, knownApps) : []),
    [result, knownApps],
  );

  const measured = result.ok ? measureBundle(result.bundle) : null;

  return (
    <Dialog
      title={TITLE[kind]}
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button
            variant="raised"
            fill="var(--pbui-tone-source)"
            disabled={!result.ok}
            onClick={() => onConfirm(text)}
          >
            {CONFIRM[kind]}
          </Button>
        </>
      }
    >
      <Stack gap={3}>
        {from === "clipboard" ? (
          <Text size="small" tone="faint" prose>
            ● Read from your clipboard — replace it if you meant another.
          </Text>
        ) : from === "template" ? (
          <Text size="small" tone="faint" prose>
            ● Loaded from a stored template.
          </Text>
        ) : (
          <Text size="small" tone="faint" prose>
            Paste a {kind} bundle below. ⌘V / Ctrl-V
          </Text>
        )}

        <TextArea
          label={`${kind} bundle`}
          value={text}
          onValueChange={setText}
          invalid={text !== "" && !result.ok}
          rows={10}
          code
          placeholder={`{ "format": "datadrop.layout", "kind": "${kind}", … }`}
        />

        {/* The live summary. Empty text says nothing at all rather than "that
            is not a DATALAB layout", because an empty field is not a mistake —
            it is the state the dialog opens in on Firefox. */}
        {text === "" ? null : result.ok ? (
          <Text size="small" tone="ok" prose>
            {/* The size stays INSIDE the block, or it wraps onto its own line
                and reads as a second, unrelated fact. */}
            <span className={styles.verdict}>
              ✓ {describeBundle(result.bundle)}
              {measured ? ` ${Math.max(1, Math.round(measured.bytes / 1024))} kB.` : ""}
            </span>
          </Text>
        ) : (
          <Text size="small" tone="danger" prose>
            <span className={styles.verdict}>✕ {capitalise(result.reason)}.</span>
          </Text>
        )}

        {missing.length > 0 && (
          <Text size="small" tone="faint" prose>
            ⚠ This build has no application called {missing.map((a) => `“${a}”`).join(", ")}. Those
            tiles will import and can be re-pointed from their own picker.
          </Text>
        )}

        {error && (
          <Text size="small" tone="danger" prose>
            {error}
          </Text>
        )}
      </Stack>
    </Dialog>
  );
}

/** The reasons read as sentence fragments; the dialog shows them as sentences. */
function capitalise(reason: string): string {
  return reason.charAt(0).toUpperCase() + reason.slice(1);
}
