import { useDispatch, useSelector } from "react-redux";
import { describeSource } from "../../model/chart";
import { registerApp, type AppProps } from "../registry";
import type { RootState } from "../../store";
import { worldActions } from "../../store/world";
import { AppBody, Stack, Surface, Toolbar } from "../../components/layout";
import { Text } from "../../components/foundation";
import { Button, DocChip, IconButton, TextInput } from "../../components/atoms";

/**
 * The document manager.
 *
 * The active document is marked unmissably: ambient verbs — those fired from a
 * chip that names no document — land there, and a user who cannot see which one
 * is active cannot predict where a menu entry will act.
 */
function ChartsApp(_props: AppProps) {
  const dispatch = useDispatch();
  const docs = useSelector((s: RootState) => s.world.docOrder.map((id) => s.world.docs[id]!));
  const activeDocId = useSelector((s: RootState) => s.world.activeDocId);

  return (
    <>
      <Toolbar tight>
        <Button variant="framed" size="tiny" onClick={() => dispatch(worldActions.newDoc(null))}>
          ＋ new document
        </Button>
      </Toolbar>
      <AppBody>
        <Stack gap={3}>
          <Text size="tiny" tone="faint" prose>
            Every card is a live composition with its own pipeline and encoding.
            Any chart / table / pipeline / encoding tile can be re-pointed at any
            of them from its DOC strip.
          </Text>
          {docs.map((doc) => (
            <Surface
              key={doc.id}
              border={doc.id === activeDocId ? "firm" : "hair"}
              padding={3}
            >
              <Stack gap={2}>
                <Stack direction="row" gap={2} align="center" wrap>
                  <DocChip docId={doc.id} />
                  <TextInput
                    label="document name"
                    value={doc.name}
                    width="narrow"
                    size="small"
                    onValueChange={(name) =>
                      dispatch(worldActions.renameDoc({ docId: doc.id, name }))
                    }
                  />
                </Stack>
                <Text size="tiny" tone="faint">
                  {doc.spec.source.drop ? describeSource(doc.spec.source) : "no source"} ⊳{" "}
                  {doc.spec.steps.filter((s) => s.on).length} steps ⊳ geom_{doc.spec.geom} · x↦
                  {doc.spec.mapping.x ?? "—"} y↦{doc.spec.mapping.y ?? "—"} ·{" "}
                  {doc.limit.toLocaleString()} row budget
                </Text>
                <Stack direction="row" gap={2} wrap>
                  {doc.id !== activeDocId && (
                    <Button
                      variant="framed"
                      size="tiny"
                      onClick={() => dispatch(worldActions.setActiveDoc(doc.id))}
                    >
                      set active
                    </Button>
                  )}
                  <Button
                    variant="framed"
                    size="tiny"
                    onClick={() =>
                      dispatch(
                        worldActions.duplicateDoc({ docId: doc.id, id: crypto.randomUUID() }),
                      )
                    }
                  >
                    ⧉ duplicate
                  </Button>
                  <Button
                    variant="framed"
                    size="tiny"
                    onClick={() =>
                      dispatch(worldActions.snapshot(doc.id, new Date().toISOString()))
                    }
                  >
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
                    onClick={() => dispatch(worldActions.deleteDoc(doc.id))}
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

registerApp({
  id: "charts",
  title: "charts",
  tone: "var(--pbui-tone-doc)",
  docBound: false,
  Component: ChartsApp,
});
