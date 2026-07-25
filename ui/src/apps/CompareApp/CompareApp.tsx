import { useDispatch, useSelector } from "react-redux";
import { describeSource } from "../../model/chart";
import { stepLabel } from "../../model/pipeline";
import { usePbui } from "../../pbui";
import { registerApp, type AppProps } from "../registry";
import type { RootState } from "../../store";
import type { Snapshot } from "../../store/world";
import { worldActions } from "../../store/world";
import { AppBody, Stack, Surface } from "../../components/layout";
import { SectionLabel, Text } from "../../components/foundation";
import { Button } from "../../components/atoms";

/**
 * Two pinned snapshots, as an ALIGNED DIFF rather than two summaries.
 *
 * Comparing two charts is almost always asking *what is different*, and making
 * the reader do that diff by eye is work the machine can do. The prototype
 * shows two independent summaries (pbui-gog.jsx:1933-1936); this highlights the
 * rows that disagree.
 */
function rows(snapshot: Snapshot | null): Record<string, string> {
  if (!snapshot) return {};
  return {
    source: describeSource(snapshot.spec.source),
    "row budget": snapshot.limit.toLocaleString(),
    geom: snapshot.spec.geom,
    "y scale": snapshot.spec.yScale,
    steps: snapshot.spec.steps.filter((s) => s.on).map(stepLabel).join(" ⊳ ") || "(none)",
    x: snapshot.spec.mapping.x ?? "—",
    y: snapshot.spec.mapping.y ?? "—",
    colour: snapshot.spec.mapping.color ?? "—",
    size: snapshot.spec.mapping.size ?? "—",
    facet: snapshot.spec.mapping.facet ?? "—",
  };
}

function CompareApp(_props: AppProps) {
  const dispatch = useDispatch();
  const pbui = usePbui();
  const pins = useSelector((s: RootState) => s.world.pins);
  const snapshots = useSelector((s: RootState) => s.world.snapshots);

  const a = pins[0] ? (snapshots[pins[0]] ?? null) : null;
  const b = pins[1] ? (snapshots[pins[1]] ?? null) : null;
  const left = rows(a);
  const right = rows(b);
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])];

  const pick = async (slot: 0 | 1) => {
    const result = await pbui.accept({
      ptype: "chart",
      prompt: `COMPARE ${slot === 0 ? "A" : "B"} — click a snapshot in the gallery`,
    });
    if (result) {
      dispatch(worldActions.pinSnapshot({ slot, snapshotId: result.value as string }));
    }
  };

  return (
    <AppBody>
      <Stack gap={3}>
        <Stack direction="row" gap={3} wrap>
          {([0, 1] as const).map((slot) => (
            <Stack key={slot} direction="row" gap={2} align="center">
              <Text size="small" strong tone={slot === 0 ? "danger" : "default"}>
                {slot === 0 ? "A" : "B"}
              </Text>
              <Text size="small">{(slot === 0 ? a : b)?.name ?? "empty"}</Text>
              <Button variant="framed" size="tiny" onClick={() => void pick(slot)}>
                accept…
              </Button>
            </Stack>
          ))}
        </Stack>

        {!a && !b ? (
          <Text size="small" tone="faint" prose>
            Pin two snapshots to compare them. Rows that differ are marked.
          </Text>
        ) : (
          <Surface border="hair" padding={3}>
            <Stack gap={2}>
              <SectionLabel>Specification diff</SectionLabel>
              {keys.map((key) => {
                const differs = left[key] !== right[key];
                return (
                  <Stack key={key} direction="row" gap={3} align="baseline">
                    <Text size="tiny" tone="faint">
                      <span style={{ display: "inline-block", width: 78 }}>{key}</span>
                    </Text>
                    <Text size="small" tone={differs ? "danger" : "default"} strong={differs}>
                      <span style={{ display: "inline-block", minWidth: 150 }}>
                        {left[key] ?? "—"}
                      </span>
                    </Text>
                    <Text size="small" tone={differs ? "danger" : "default"} strong={differs}>
                      {right[key] ?? "—"}
                    </Text>
                  </Stack>
                );
              })}
            </Stack>
          </Surface>
        )}
      </Stack>
    </AppBody>
  );
}

registerApp({
  id: "compare",
  title: "compare a/b",
  tone: "var(--pbui-tone-cat)",
  docBound: false,
  Component: CompareApp,
});
