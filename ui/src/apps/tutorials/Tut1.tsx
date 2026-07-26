import { newStep } from "../../model/pipeline";
import { registerApp, type AppProps } from "../../appkit/registry";
import { worldActions } from "../../store/world";
import { Step, TutorialBody, TutorialHead } from "./Tutorial";
import { Text } from "../../components/foundation";

/** Tutorial 1 — presentations and the accept protocol. */
function Tut1(_props: AppProps) {
  return (
    <TutorialBody>
      <TutorialHead title="1 · presentations & accept">
        The one idea underneath everything: whatever is on screen is a typed, live object. Three
        moves — hover, right-click, accept.
      </TutorialHead>

      <Step n={1}>
        <strong>Hover asks.</strong> Move the pointer over any chip and read the black bar at the
        very bottom. That is the <em>mouse documentation line</em>, straight out of Genera: it
        always says what the object is and what the left and right buttons will do to it. Nothing
        here needs memorising.
      </Step>

      <Step n={2}>
        <strong>Right-click gives the full menu.</strong> R-click a field chip in the pipeline
        tile's OUT strip. Because it is a <em>field</em>, the menu offers field verbs: map to a
        channel, filter on it, group by it, inspect it. Note that <em>Map to y</em> is greyed for a
        nominal column, with the reason beside it — a verb that is hidden teaches nothing.
      </Step>

      <Step n={3}>
        <strong>Left-click does the default verb.</strong> A source chip loads itself into the
        active document; a document chip makes itself active. The mouse-doc line announces the
        default before you commit to it.
      </Step>

      <Step
        n={4}
        runLabel="add a filter step"
        run={({ dispatch, state }) => {
          const docId = state.world.activeDocId;
          const doc = docId ? state.world.docs[docId] : undefined;
          if (!doc) return;
          // Exactly the action the menu fires. That is the point: this button
          // and the verb are the same code path, so the lesson cannot drift.
          dispatch(
            worldActions.addStep({
              docId,
              step: { ...newStep("filter", []), field: "data.station", op: "=", value: "north" },
            }),
          );
        }}
      >
        <strong>Commands accept objects.</strong> In the encoding tile, press <strong>⌖</strong>{" "}
        beside a channel. A red banner appears, every field that channel can use starts pulsing, and
        the next one you click — in any tile, in any workspace — is consumed. <kbd>Esc</kbd> aborts.
        Fields the channel cannot use stay inert, so an impossible mapping is unreachable rather
        than merely refused.
      </Step>

      <Step n={5}>
        <strong>Everything is audited.</strong> Every verb lands in the <em>trace</em> tile — a
        running transcript of the session. If you do not understand what a click did, read what it
        did.
      </Step>

      <Text size="tiny" tone="faint">
        Next: <strong>2 · pipeline</strong>.
      </Text>
    </TutorialBody>
  );
}

registerApp({
  id: "tut1",
  title: "tutorial 1 · objects",
  tone: "var(--pbui-selected)",
  docBound: false,
  Component: Tut1,
});
