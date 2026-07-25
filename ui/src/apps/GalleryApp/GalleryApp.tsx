import { useDispatch, useSelector } from "react-redux";
import { describeSource } from "../../model/chart";
import { Presentation } from "../../pbui";
import { registerApp, type AppProps } from "../registry";
import type { RootState } from "../../store";
import { worldActions } from "../../store/world";
import { AppBody, Stack, Surface } from "../../components/layout";
import { Text } from "../../components/foundation";
import { Chip } from "../../components/atoms";

/**
 * Snapshots: frozen specifications.
 *
 * A snapshot holds no rows — it holds how to get them, plus the row budget so a
 * restore reproduces the same window. That is what makes it a deep copy of one
 * serialisable value rather than a bespoke format (DR-8), and it is why
 * restoring one whose source has since gone produces a document that reports
 * the problem rather than a blank tile.
 */
function GalleryApp(_props: AppProps) {
  const dispatch = useDispatch();
  const snapshots = useSelector((s: RootState) =>
    s.world.snapshotOrder.map((id) => s.world.snapshots[id]!),
  );
  const pins = useSelector((s: RootState) => s.world.pins);
  const activeName = useSelector((s: RootState) =>
    s.world.activeDocId ? (s.world.docs[s.world.activeDocId]?.name ?? "—") : "—",
  );

  return (
    <AppBody>
      <Stack gap={3}>
        <Text size="tiny" tone="faint" prose>
          A snapshot freezes a whole pipeline and encoding. L-click restores into
          the active document ({activeName}); R-click offers restore-as-new,
          pinning for compare, and delete.
        </Text>

        {snapshots.length === 0 && (
          <Text size="small" tone="faint">
            No snapshots. Use ⚑ in the charts tile.
          </Text>
        )}

        {snapshots.map((snapshot) => (
          <Surface key={snapshot.id} border="hair" padding={3}>
            <Stack gap={2}>
              <Stack direction="row" gap={2} align="center" wrap>
                <Presentation
                  ptype="chart"
                  value={snapshot.id}
                  doc={`<chart> snapshot ${snapshot.name}`}
                  onActivate={() =>
                    dispatch(
                      worldActions.restoreSnapshot({ snapshotId: snapshot.id, docId: null }),
                    )
                  }
                  activateDoc={`restore into chart ${activeName}`}
                >
                  <Chip label={snapshot.name} tone="var(--pbui-tone-geom)" strong />
                </Presentation>
                <Text size="tiny" tone="faint">
                  {snapshot.at.replace("T", " ").slice(0, 19)}
                </Text>
                {pins[0] === snapshot.id && (
                  <Text size="tiny" tone="danger" strong>
                    pinned A
                  </Text>
                )}
                {pins[1] === snapshot.id && (
                  <Text size="tiny" strong>
                    pinned B
                  </Text>
                )}
              </Stack>
              <Text size="tiny" tone="faint">
                {describeSource(snapshot.spec.source)} ⊳{" "}
                {snapshot.spec.steps.filter((s) => s.on).length} steps ⊳ geom_
                {snapshot.spec.geom} · x↦{snapshot.spec.mapping.x ?? "—"} y↦
                {snapshot.spec.mapping.y ?? "—"}
              </Text>
              <Stack direction="row" gap={2} wrap>
                {([0, 1] as const).map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() =>
                      dispatch(worldActions.pinSnapshot({ slot, snapshotId: snapshot.id }))
                    }
                    style={btn}
                  >
                    pin {slot === 0 ? "A" : "B"}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => dispatch(worldActions.deleteSnapshot(snapshot.id))}
                  style={{ ...btn, color: "var(--pbui-danger)" }}
                >
                  ✕
                </button>
              </Stack>
            </Stack>
          </Surface>
        ))}
      </Stack>
    </AppBody>
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
  id: "gallery",
  title: "snapshots",
  tone: "var(--pbui-tone-geom)",
  docBound: false,
  Component: GalleryApp,
});
