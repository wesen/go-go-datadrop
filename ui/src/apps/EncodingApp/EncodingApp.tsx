import { useDispatch, useSelector } from "react-redux";
import { CHANNELS, CHANNEL_ACCEPTS, GEOMS } from "../../model/chart";
import type { Channel } from "../../model/chart";
import { TYPE_LABEL, effectiveType } from "../../model/table";
import { Presentation, usePbui, type FieldRef } from "../../pbui";
import { registerApp, type AppProps } from "../../appkit/registry";
import { useDocPipeline } from "../useTable";
import type { RootState } from "../../store";
import { worldActions } from "../../store/world";
import { AppBody, Stack } from "../../components/layout";
import { SectionLabel, Text } from "../../components/foundation";
import { DocBar } from "../../components/molecules";
import { FieldChip, IconButton, Button } from "../../components/atoms";

/**
 * The aesthetic mapping: slot ↦ field, plus the geom and the y scale.
 *
 * Each ⌖ ACCEPTS a field, filtered to the types the channel can use (DR-10), so
 * an impossible mapping is unreachable rather than reported. The filter is the
 * improvement over the prototype and CHANNEL_ACCEPTS already existed to supply it.
 */
function EncodingApp({ leafId, docId }: AppProps) {
  const dispatch = useDispatch();
  const pbui = usePbui();
  const { doc, pipeline } = useDocPipeline(docId);
  const activeDocId = useSelector((s: RootState) => s.world.activeDocId);
  const target = doc?.id ?? activeDocId;

  const fields = pipeline?.fields ?? [];
  const typeOf = (name: string) => fields.find((f) => f.name === name)?.type ?? null;

  // A log scale needs a strictly positive domain. Disabled with a reason rather
  // than silently ignored; plot.ts falls back too, as a second line of defence.
  const yName = doc?.spec.mapping.y;
  const yValues = yName ? (pipeline?.rows ?? []).map((r) => Number(r[yName])).filter(Number.isFinite) : [];
  const logUnavailable = yValues.length === 0 || Math.min(...yValues) <= 0;

  const acceptFor = async (channel: Channel) => {
    const accepts = CHANNEL_ACCEPTS[channel];
    const result = await pbui.accept({
      ptype: "field",
      prompt: `MAP ${channel.toUpperCase()} of chart ${pbui.environment.nameOf(target)} ↦ click a FIELD anywhere`,
      filter: (_ptype, value) => {
        const ref = value as FieldRef;
        const field = fields.find((f) => f.name === ref.name);
        return field ? accepts.includes(effectiveType(field, doc?.spec.typeOverrides)) : false;
      },
    });
    if (result) {
      dispatch(
        worldActions.setMapping({ docId: target, channel, field: (result.value as FieldRef).name }),
      );
    }
  };

  return (
    <>
      <DocBar leafId={leafId} docId={docId} />
      <AppBody>
        <Stack gap={4}>
          <Stack gap={2}>
            <SectionLabel>Geom</SectionLabel>
            <Stack direction="row" gap={2} wrap>
              {GEOMS.map((geom) => (
                <Presentation
                  key={geom}
                  ptype="geom"
                  value={geom}
                  doc={`<geom> ${geom}`}
                  onActivate={() => dispatch(worldActions.setGeom({ docId: target, geom }))}
                  activateDoc="use this geom"
                >
                  <span
                    style={{
                      border: "var(--pbui-border-hair)",
                      background:
                        doc?.spec.geom === geom ? "var(--pbui-selected)" : "var(--pbui-pane-alt)",
                      padding: "0 var(--pbui-space-4)",
                      fontSize: "var(--pbui-fs-small)",
                      fontWeight: 700,
                    }}
                  >
                    {geom}
                  </span>
                </Presentation>
              ))}
            </Stack>
          </Stack>

          <Stack gap={2}>
            <SectionLabel>Channels</SectionLabel>
            {CHANNELS.map((channel) => {
              const mapped = doc?.spec.mapping[channel] ?? null;
              // A mapping the pipeline no longer produces renders STALE with a
              // warning rather than as a blank control. EncodingEditor.tsx
              // shipped the other behaviour: the select read as unset while the
              // spec still held the dead name and the plot refused.
              const stale = mapped !== null && typeOf(mapped) === null;
              return (
                <Stack key={channel} direction="row" gap={3} align="center" wrap>
                  <Text size="small" strong>
                    <span style={{ display: "inline-block", width: 44 }}>{channel}</span>
                  </Text>
                  {mapped ? (
                    <FieldChip field={{ docId: target, name: mapped }} testId={`mapped-${channel}`} />
                  ) : (
                    <Text size="small" tone="faint">
                      — unmapped —
                    </Text>
                  )}
                  {stale && (
                    <Text size="tiny" tone="danger">
                      ⚠ not in the pipeline output — a step removed it
                    </Text>
                  )}
                  <IconButton
                    variant="framed"
                    glyph="⌖"
                    label={`accept a field for ${channel}`}
                    title={`accept a <field> for ${channel} — click one anywhere`}
                    onClick={() => void acceptFor(channel)}
                  />
                  <IconButton
                    variant="framed"
                    glyph="×"
                    label={`clear ${channel}`}
                    disabled={!mapped}
                    onClick={() =>
                      dispatch(worldActions.setMapping({ docId: target, channel, field: null }))
                    }
                  />
                  <Text size="tiny" tone="faint">
                    {CHANNEL_ACCEPTS[channel].map((t) => TYPE_LABEL[t]).join(" / ")}
                  </Text>
                </Stack>
              );
            })}
          </Stack>

          <Stack gap={2}>
            <SectionLabel>Y scale</SectionLabel>
            <Stack direction="row" gap={2} align="center">
              {(["linear", "log"] as const).map((scale) => (
                <Button
                  key={scale}
                  variant="framed"
                  selected={doc?.spec.yScale === scale}
                  disabled={scale === "log" && logUnavailable}
                  title={
                    scale === "log" && logUnavailable
                      ? "a log scale needs a strictly positive y domain"
                      : undefined
                  }
                  onClick={() => dispatch(worldActions.setYScale({ docId: target, scale }))}
                >
                  {scale}
                </Button>
              ))}
              {logUnavailable && (
                <Text size="tiny" tone="faint">
                  log needs y &gt; 0 throughout
                </Text>
              )}
            </Stack>
          </Stack>
        </Stack>
      </AppBody>
    </>
  );
}

registerApp({
  id: "encode",
  title: "encoding",
  tone: "var(--pbui-tone-chart)",
  docBound: true,
  Component: EncodingApp,
});
