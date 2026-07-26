import { useDispatch, useSelector } from "react-redux";
import { CHANNELS, CHANNEL_ACCEPTS } from "../../model/chart";
import type { Channel } from "../../model/chart";
import { effectiveType } from "../../model/table";
import { usePbui, type FieldRef } from "../../pbui";
import { registerApp, type AppProps } from "../../appkit/registry";
import { useDocPipeline } from "../useTable";
import type { RootState } from "../../store";
import { worldActions } from "../../store/world";
import { DocBar } from "../../components/molecules";
import { EncodingPanel } from "../../components/organisms";

/**
 * The aesthetic mapping — the container half.
 *
 * Two things live here because both need the pipeline's rows or its schema, and
 * a panel that touched either would be back in the render path DATADROP-6's
 * follow-up guide is about:
 *
 *  - **the accept filter**, which decides that a nominal column may not be
 *    mapped to y, so an impossible mapping is unreachable rather than reported;
 *  - **`logUnavailable`**, which scans the y column for a non-positive value.
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
  const yValues = yName
    ? (pipeline?.rows ?? []).map((r) => Number(r[yName])).filter(Number.isFinite)
    : [];
  const logUnavailable = yValues.length === 0 || Math.min(...yValues) <= 0;

  // A mapping the pipeline no longer produces. The panel renders it stale with a
  // warning; the alternative — a blank control over a specification that still
  // holds the dead name — is what the predecessor shipped.
  const staleChannels = CHANNELS.filter((channel) => {
    const mapped = doc?.spec.mapping[channel] ?? null;
    return mapped !== null && typeOf(mapped) === null;
  });

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
      <EncodingPanel
        geom={doc?.spec.geom ?? null}
        mapping={doc?.spec.mapping ?? { x: null, y: null, color: null, size: null, facet: null }}
        yScale={doc?.spec.yScale ?? null}
        staleChannels={staleChannels}
        logUnavailable={logUnavailable}
        docId={target}
        onGeom={(geom) => dispatch(worldActions.setGeom({ docId: target, geom }))}
        onAccept={(channel) => void acceptFor(channel)}
        onClear={(channel) =>
          dispatch(worldActions.setMapping({ docId: target, channel, field: null }))
        }
        onYScale={(scale) => dispatch(worldActions.setYScale({ docId: target, scale }))}
      />
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
