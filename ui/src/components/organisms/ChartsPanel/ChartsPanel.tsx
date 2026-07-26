import type { ChartSpec } from "../../../model/chart";
import { Button, DocChip, IconButton, TextInput } from "../../atoms";
import { Text } from "../../foundation";
import { AppBody, Stack, Surface, Toolbar } from "../../layout";
import { SpecSummary } from "../../molecules";

/** One document, as the panel needs it. */
export interface DocView {
  id: string;
  name: string;
  limit: number;
  spec: ChartSpec;
}

/**
 * The document manager.
 *
 * The active document is marked unmissably: ambient verbs — those fired from a
 * chip that names no document — land there, and a user who cannot see which one
 * is active cannot predict where a menu entry will act.
 *
 * ## Active is a border weight, not a colour
 *
 * `border="firm"` against `border="hair"`. The distinction has to survive a
 * reader who cannot separate the two hues, and it has to survive a screenshot
 * in a document that has been through a photocopier — which is a real thing
 * that happens to a teaching interface.
 *
 * ## The last document cannot be deleted
 *
 * Disabled, with the reason in its label, rather than hidden. A workbench with
 * no documents shows "no documents" in four tiles and offers no route back
 * except the toolbar button — which is a recoverable state but a baffling one,
 * and the rule that prevents it should be legible where it applies.
 */
export function ChartsPanel({
  docs,
  activeDocId,
  onNew,
  onRename,
  onActivate,
  onDuplicate,
  onSnapshot,
  onDelete,
}: {
  docs: readonly DocView[];
  activeDocId: string | null;
  onNew: () => void;
  onRename: (docId: string, name: string) => void;
  onActivate: (docId: string) => void;
  onDuplicate: (docId: string) => void;
  onSnapshot: (docId: string) => void;
  onDelete: (docId: string) => void;
}) {
  return (
    <>
      <Toolbar tight>
        <Button variant="framed" size="tiny" onClick={onNew}>
          ＋ new document
        </Button>
      </Toolbar>
      <AppBody>
        <Stack gap={3}>
          <Text size="tiny" tone="faint" prose>
            Every card is a live composition with its own pipeline and encoding. Any chart / table /
            pipeline / encoding tile can be re-pointed at any of them from its DOC strip.
          </Text>

          {docs.map((doc) => (
            <Surface key={doc.id} border={doc.id === activeDocId ? "firm" : "hair"} padding={3}>
              <Stack gap={2}>
                <Stack direction="row" gap={2} align="center" wrap>
                  <DocChip docId={doc.id} />
                  <TextInput
                    label="document name"
                    value={doc.name}
                    width="narrow"
                    size="small"
                    onValueChange={(name) => onRename(doc.id, name)}
                  />
                </Stack>

                <SpecSummary spec={doc.spec} limit={doc.limit} />

                <Stack direction="row" gap={2} wrap>
                  {doc.id !== activeDocId && (
                    <Button variant="framed" size="tiny" onClick={() => onActivate(doc.id)}>
                      set active
                    </Button>
                  )}
                  <Button variant="framed" size="tiny" onClick={() => onDuplicate(doc.id)}>
                    ⧉ duplicate
                  </Button>
                  <Button variant="framed" size="tiny" onClick={() => onSnapshot(doc.id)}>
                    ⚑ snapshot
                  </Button>
                  <IconButton
                    variant="framed"
                    size="tiny"
                    glyph="✕"
                    label={
                      docs.length < 2 ? "the last document cannot be deleted" : "delete document"
                    }
                    disabled={docs.length < 2}
                    onClick={() => onDelete(doc.id)}
                  />
                </Stack>
              </Stack>
            </Surface>
          ))}
        </Stack>
      </AppBody>
    </>
  );
}
