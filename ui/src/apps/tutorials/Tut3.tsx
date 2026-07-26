import { registerApp, type AppProps } from "../../appkit/registry";
import { worldActions } from "../../store/world";
import { Step, TutorialBody, TutorialHead } from "./Tutorial";

/** Tutorial 3 — channels, geoms, facets and scales. */
function Tut3(_props: AppProps) {
  return (
    <TutorialBody>
      <TutorialHead title="3 · encoding, geoms, facets, scales">
        The grammar-of-graphics half: a chart is{" "}
        <strong>data + aesthetic mappings + a geometry</strong>. Nothing is drawn by hand — you
        declare which field drives which visual channel and the chart follows.
      </TutorialHead>

      <Step
        n={1}
        runLabel="x↦time · y↦temp_c · colour↦station"
        run={({ dispatch, state }) => {
          const docId = state.world.activeDocId;
          dispatch(worldActions.setGeom({ docId, geom: "line" }));
          dispatch(worldActions.setMapping({ docId, channel: "x", field: "time" }));
          dispatch(worldActions.setMapping({ docId, channel: "y", field: "data.temp_c" }));
          dispatch(worldActions.setMapping({ docId, channel: "color", field: "data.station" }));
          dispatch(worldActions.setMapping({ docId, channel: "facet", field: null }));
        }}
      >
        <strong>Mapping is slot ↦ field.</strong> One line per station, with a legend derived from
        the field's levels. The x axis is a <em>continuous</em> time scale with ticks on round units
        of time — not one slot per distinct timestamp, which would draw uneven intervals evenly.
      </Step>

      <Step
        n={2}
        runLabel="flip to bar, and watch it object"
        run={({ dispatch, state }) =>
          dispatch(worldActions.setGeom({ docId: state.world.activeDocId, geom: "bar" }))
        }
      >
        <strong>Geoms state their requirements.</strong> A bar wants a nominal or temporal x.
        Instead of drawing nonsense the chart says what to change. Invalid specifications explain
        themselves rather than failing silently.
      </Step>

      <Step
        n={3}
        runLabel="facet by station"
        run={({ dispatch, state }) => {
          const docId = state.world.activeDocId;
          dispatch(worldActions.setGeom({ docId, geom: "line" }));
          dispatch(worldActions.setMapping({ docId, channel: "facet", field: "data.station" }));
        }}
      >
        <strong>Facets are one mapping away.</strong> Small multiples, one panel per level, sharing
        one pair of scales — because panels with independent axes cannot be compared, which is the
        only reason to put them side by side.
      </Step>

      <Step
        n={4}
        runLabel="size↦humidity"
        run={({ dispatch, state }) => {
          const docId = state.world.activeDocId;
          dispatch(worldActions.setGeom({ docId, geom: "point" }));
          dispatch(worldActions.setMapping({ docId, channel: "size", field: "data.humidity" }));
        }}
      >
        <strong>Two more channels.</strong> Size maps a quantity to mark radius, square-root scaled
        so that <em>area</em> is proportional to the value — a linear radius exaggerates large
        values by the square, which is the most common quantitative-encoding error in charts. The
        y-scale toggle offers log, and disables itself with a reason when the domain is not strictly
        positive.
      </Step>

      <Step n={5}>
        <strong>Close the loop.</strong> The marks are <em>&lt;datum&gt;</em>
        presentations and the legend swatches are <em>&lt;cat&gt;</em>
        presentations. R-click one and choose <em>Keep only …</em>: a real filter step appears in
        the pipeline tile, live and toggleable. The chart is not a dead-end render — it is another
        surface of the same object.
      </Step>
    </TutorialBody>
  );
}

registerApp({
  id: "tut3",
  title: "tutorial 3 · encoding",
  tone: "var(--pbui-selected)",
  docBound: false,
  duplicable: false,
  singleton: true,
  Component: Tut3,
});
