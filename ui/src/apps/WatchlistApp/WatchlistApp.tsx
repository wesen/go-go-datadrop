import { useDispatch, useSelector } from "react-redux";
import { Presentation, labelFor, toneFor, usePbui } from "../../pbui";
import { registerApp, type AppProps } from "../registry";
import type { RootState } from "../../store";
import { worldActions } from "../../store/world";
import { AppBody, Stack, Toolbar } from "../../components/layout";
import { Text } from "../../components/foundation";
import { Chip } from "../../components/atoms";

/**
 * A scratchpad of pinned objects, of any type.
 *
 * The clearest demonstration in the product that presentations are handles
 * rather than pictures: a watched field is still a live field, mappable and
 * filterable from here exactly as from a table header. It re-presents through
 * the registry, so it works for every type without knowing any of them.
 */
function WatchlistApp(_props: AppProps) {
  const dispatch = useDispatch();
  const pbui = usePbui();
  const watch = useSelector((s: RootState) => s.world.watch);

  return (
    <>
      <Toolbar tight>
        <button
          type="button"
          onClick={async () => {
            // A UNION accept: anything at all. The API takes an array of types
            // for exactly this (pbui-gog.jsx:2095).
            const result = await pbui.accept({
              ptype: ["field", "source", "doc", "step", "datum", "cat", "chart"],
              prompt: "WATCH — click any presentation, in any tile or workspace",
            });
            if (result) dispatch(worldActions.watchAdd(result.ptype, result.value));
          }}
          style={{
            border: "var(--pbui-border-firm)",
            boxShadow: "var(--pbui-shadow-hard)",
            background: "var(--pbui-tone-chart)",
            padding: "0 var(--pbui-space-4)",
            fontSize: "var(--pbui-fs-small)",
            fontWeight: 700,
          }}
        >
          Watch… (accepts anything)
        </button>
      </Toolbar>

      <AppBody>
        <Stack gap={2}>
          {watch.length === 0 && (
            <Text size="small" tone="faint" prose>
              Nothing watched. A watched object stays LIVE — a watched field can
              still be mapped or filtered from here.
            </Text>
          )}
          {watch.map((entry) => (
            <Stack key={entry.id} direction="row" gap={2} align="center">
              <Text size="tiny" tone="faint">
                &lt;{entry.ptype}&gt;
              </Text>
              <Presentation
                ptype={entry.ptype}
                value={entry.value}
                doc={`<${entry.ptype}> ${labelFor(entry.ptype, entry.value, pbui.environment)}`}
              >
                <Chip
                  label={labelFor(entry.ptype, entry.value, pbui.environment)}
                  tone={toneFor(entry.ptype)}
                />
              </Presentation>
              <span style={{ flex: 1 }} />
              <button
                type="button"
                aria-label="remove from watchlist"
                onClick={() => dispatch(worldActions.watchRemove(entry.id))}
                style={{
                  border: "var(--pbui-border-hair)",
                  background: "var(--pbui-pane-alt)",
                  padding: "0 var(--pbui-space-2)",
                  fontSize: "var(--pbui-fs-tiny)",
                  color: "var(--pbui-danger)",
                  fontWeight: 700,
                }}
              >
                ✕
              </button>
            </Stack>
          ))}
        </Stack>
      </AppBody>
    </>
  );
}

registerApp({
  id: "watch",
  title: "watchlist",
  tone: "var(--pbui-tone-chart)",
  docBound: false,
  Component: WatchlistApp,
});
