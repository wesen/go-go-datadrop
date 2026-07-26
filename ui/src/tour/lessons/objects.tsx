import type { Lesson } from "../../appkit/lessons";
import { worldActions } from "../../store/world";
import { COLUMNS } from "../fixtures";

/**
 * §A — Objects and verbs.
 *
 * The one idea underneath everything: whatever is displayed stays a first-class
 * handle on the real object, so it carries its type, so it carries a menu of
 * verbs appropriate to that type. Three moves to learn — hover, right-click,
 * accept — and the third is the one nobody guesses.
 *
 * Note what none of these predicates ask. Not "was the ▶ button pressed", not
 * "was this action dispatched" — each asks whether the *world* reached a state.
 * A2 is satisfied by inspecting anything at all, by any route, which is the
 * property that makes this a tutorial about the system rather than about where
 * its buttons are.
 */
export const objectsLessons: Lesson[] = [
  {
    id: "a1",
    title: "Pointing is asking",
    manual: true,
    body: (
      <>
        Sweep the pointer slowly across the field chips in the sources tile and watch the{" "}
        <strong>black line along the bottom of the panel</strong>. It never stops telling you what
        you are pointing at and what a click will do. This is the whole safety net: nothing in this
        interface has to be memorised, because the screen describes itself as you move.
      </>
    ),
  },
  {
    id: "a2",
    title: "Right-click gives every verb",
    body: (
      <>
        Right-click the <strong>{COLUMNS.temp}</strong> chip. The menu you get is the list of
        things a <em>field</em> can do — map it to a channel, filter on it, group by it, inspect
        it. Choose <strong>Inspect</strong> and its distribution lands in the inspector tile. Now
        right-click the <strong>lab / temps</strong> source chip instead: a different type, so a
        different menu. That is the entire idea of the system in two clicks.{" "}
        <em>(Trackpad: two-finger click or ⌃-click.)</em>
      </>
    ),
    run: ({ dispatch }) => {
      dispatch(
        worldActions.inspect({
          title: `<field> ${COLUMNS.temp}`,
          value: {
            presentationType: "field",
            name: COLUMNS.temp,
            note: "inspected by the tutorial — do it yourself from the object menu",
          },
        }),
      );
    },
    // Any inspection at all, of anything. The lesson is that Inspect exists on
    // every type, so demanding a particular one would be teaching the opposite.
    done: (state) => state.world.inspected !== null,
    predict: {
      q: "Right-click the source chip instead of a field. Do you get the same menu?",
      options: ["the same menu", "a different menu"],
      answer: 1,
      reveal:
        "A source is a different type, so it offers different verbs — load it, set the row budget. The menu is not attached to the pixel; it is attached to what the pixel is.",
    },
  },
  {
    id: "a3",
    title: "Accept: a command reaching out for its argument",
    body: (
      <>
        In the watchlist tile press <strong>Watch…</strong>. A red banner appears, everything
        acceptable starts pulsing, and the next object you click is consumed by the waiting
        command. The command has paused with its hand out. Click a field chip over in the{" "}
        <em>sources</em> tile — a different tile — and watch it get swallowed.{" "}
        <strong>Esc</strong> aborts. Map-to-channel and compare A/B work the same way.
      </>
    ),
    run: async ({ dispatch, accept }) => {
      const picked = await accept({
        ptype: "field",
        prompt: "TUTORIAL — click any FIELD chip, in any tile",
      });
      if (picked) dispatch(worldActions.watchAdd("field", picked.value));
    },
    done: (state) => state.world.watch.length > 0,
  },
  {
    id: "a4",
    title: "Everything you did is on the record",
    manual: true,
    body: (
      <>
        The <strong>trace</strong> has been filling since lesson one without being mentioned. Every
        verb — yours or the tutorial&apos;s — is appended there with the object it acted on. Not a
        debug log: a transcript of the session. Switch a tile to <em>trace</em> to read it.
      </>
    ),
  },
];
