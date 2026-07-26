import { registerApp, type AppProps } from "../../appkit/registry";
import { worldActions } from "../../store/world";
import { Step, TutorialBody, TutorialHead } from "./Tutorial";

/** Tutorial 4 — documents, snapshots and compare. */
function Tut4(_props: AppProps) {
  return (
    <TutorialBody>
      <TutorialHead title="4 · documents, snapshots, compare">
        The world holds any number of chart documents — α, β, γ … — each with its own pipeline and
        encoding, plus frozen snapshots of any of them.
      </TutorialHead>

      <Step
        n={1}
        runLabel="new document"
        run={({ dispatch }) => dispatch(worldActions.newDoc(null))}
      >
        <strong>Documents are the state; tiles are views.</strong> Every chart, table, pipeline and
        encoding tile carries a DOC strip naming which document it shows. The dropdown re-points it;
        ＋ spawns a fresh one.
      </Step>

      <Step n={2}>
        <strong>Two tiles, one document, perfect lockstep.</strong> Split a chart tile with{" "}
        <strong>⬌</strong> and point both halves at the same document. They move together because
        they are views of one object, not copies — which is exactly why a tile can hold no state of
        its own.
      </Step>

      <Step
        n={3}
        runLabel="make the first document active"
        run={({ dispatch, state }) => {
          const first = state.world.docOrder[0];
          if (first) dispatch(worldActions.setActiveDoc(first));
        }}
      >
        <strong>The ACTIVE document.</strong> Verbs fired from a chip that names no document —{" "}
        <em>map to x</em>, <em>keep only …</em> — need a target, and they use the active one. Every
        menu header says which that is before you commit.
      </Step>

      <Step
        n={4}
        runLabel="⚑ snapshot the active chart"
        run={({ dispatch, state }) => {
          const docId = state.world.activeDocId;
          if (docId) dispatch(worldActions.snapshot(docId, new Date().toISOString()));
        }}
      >
        <strong>Snapshots freeze; documents live.</strong> ⚑ deep-copies the active document's whole
        specification into the gallery. Keep editing the document afterwards — the snapshot does not
        move. It holds no rows, only how to get them, plus the row budget so a restore reproduces
        the window.
      </Step>

      <Step n={5}>
        <strong>Restore and compare.</strong> L-click a snapshot to restore it into the active
        document; R-click to restore it as a <em>new</em>
        document — forking the past. The compare tile accepts two snapshots and shows an aligned
        diff of their specifications, marking the rows that differ.
      </Step>
    </TutorialBody>
  );
}

registerApp({
  id: "tut4",
  title: "tutorial 4 · documents",
  tone: "var(--pbui-selected)",
  docBound: false,
  Component: Tut4,
});
