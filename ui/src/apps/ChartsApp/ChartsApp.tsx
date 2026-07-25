import { useDispatch, useSelector } from "react-redux";
import { describeSource } from "../../model/chart";
import { registerApp, type AppProps } from "../registry";
import type { RootState } from "../../store";
import { worldActions } from "../../store/world";
import { AppBody, Stack, Surface, Toolbar } from "../../components/layout";
import { Text } from "../../components/foundation";
import { DocChip } from "../../components/atoms";

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
        <button type="button" onClick={() => dispatch(worldActions.newDoc(null))} style={btn}>
          ＋ new document
        </button>
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
                  <input
                    value={doc.name}
                    aria-label="document name"
                    onChange={(event) =>
                      dispatch(worldActions.renameDoc({ docId: doc.id, name: event.target.value }))
                    }
                    style={{
                      border: "var(--pbui-border-hair)",
                      background: "var(--pbui-pane)",
                      fontSize: "var(--pbui-fs-small)",
                      width: 64,
                    }}
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
                    <button
                      type="button"
                      onClick={() => dispatch(worldActions.setActiveDoc(doc.id))}
                      style={btn}
                    >
                      set active
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      dispatch(
                        worldActions.duplicateDoc({ docId: doc.id, id: crypto.randomUUID() }),
                      )
                    }
                    style={btn}
                  >
                    ⧉ duplicate
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      dispatch(worldActions.snapshot(doc.id, new Date().toISOString()))
                    }
                    style={btn}
                  >
                    ⚑ snapshot
                  </button>
                  <button
                    type="button"
                    disabled={docs.length < 2}
                    title={docs.length < 2 ? "the last document cannot be deleted" : undefined}
                    onClick={() => dispatch(worldActions.deleteDoc(doc.id))}
                    style={{ ...btn, opacity: docs.length < 2 ? 0.4 : 1 }}
                  >
                    ✕
                  </button>
                </Stack>
              </Stack>
            </Surface>
          ))}
        </Stack>
      </AppBody>
    </>
  );
}

const btn: React.CSSProperties = {
  border: "var(--pbui-border-hair)",
  background: "var(--pbui-pane-alt)",
  padding: "0 var(--pbui-space-3)",
  fontSize: "var(--pbui-fs-tiny)",
  fontWeight: 700,
};

registerApp({
  id: "charts",
  title: "charts",
  tone: "var(--pbui-tone-doc)",
  docBound: false,
  Component: ChartsApp,
});
