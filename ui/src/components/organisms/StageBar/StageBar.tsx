import { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { RootState } from "../../../store";
import { layoutActions } from "../../../store/layout";
import { Presentation, usePbui } from "../../../pbui";
import { Text } from "../../foundation";
import { IconButton, SelectInput } from "../../atoms";
import styles from "./StageBar.module.css";

/**
 * The stage switcher, at the right end of the masthead.
 *
 * "Always accessible with a button on the top right that is used to manage
 * account, stored workspace templates, etc." — the request's item 3. The button
 * is a stage switcher because account management *is* a stage (DR-58): there is
 * no separate account menu to keep in step with the stage list.
 *
 * ## Why the name is repeated beside the control
 *
 * A `<select>` shows its own value, so the leading `▸ work` looks redundant.
 * It is not: the select is 9.5px native chrome at the far right of a dark
 * masthead, and "which part of the product am I in" is the one fact this bar
 * exists to state. The prose answer stays legible when the control is not.
 *
 * ## Why it is a connected organism
 *
 * Like `WorkspaceStrip`, which it sits above in the hierarchy and mirrors in
 * behaviour. Both are chrome over one slice, both are rendered exactly once by
 * the shell, and giving either a DTO-and-callbacks shape would mean the shell
 * re-deriving state it does not otherwise touch.
 */
export function StageBar() {
  const dispatch = useDispatch();
  const pbui = usePbui();
  const all = useSelector((state: RootState) => state.layout.stages);
  const currentId = useSelector((state: RootState) => state.layout.currentStageId);
  const current = all.find((stage) => stage.id === currentId);

  /**
   * A stage that hides the switcher is not offered BY the switcher.
   *
   * Found by clicking, not by a test: selecting `sign in` from the dropdown
   * strands the user on a stage whose chrome includes no stage bar and no
   * workspace strip, so there is no route back short of clearing storage. The
   * sign-in stage is somewhere the *gate* puts you, never somewhere you choose
   * to go, and `chrome.stageBar: false` already says exactly that — it just was
   * not being read as a statement about reachability.
   */
  const stages = useMemo(
    () => all.filter((stage) => stage.chrome.stageBar || stage.id === currentId),
    [all, currentId],
  );

  // One stage is not a choice. A tour panel seeds exactly one and would
  // otherwise render a switcher that cannot switch — furniture that reads as a
  // control.
  if (!current) return null;

  /**
   * The stage's own name is a presentation, so its verbs live in one place.
   *
   * Export, import and inspect are reached by right-clicking the name or by the
   * `▾` button, which calls `openMenu` with the same value — one line, and it
   * means the switcher is not a second mechanism with its own copy of the stage
   * verbs to keep in step.
   */
  const value = {
    stageId: current.id,
    name: current.name,
    pinned: current.pinned === true,
    current: true,
  };

  const name = (
    <Presentation ptype="stage" value={value} doc={`<stage> ${current.name}`}>
      <Text size="tiny" tone="faint">
        <span className={styles.name}>▸ {current.name}</span>
      </Text>
    </Presentation>
  );

  // One stage is not a choice. A tour panel seeds exactly one and would
  // otherwise render a switcher that cannot switch — furniture that reads as a
  // control. The name stays, and stays right-clickable.
  if (stages.length < 2) return <span className={styles.bar}>{name}</span>;

  return (
    <span className={styles.bar}>
      {name}
      <SelectInput
        label="stage"
        variant="framed"
        size="tiny"
        value={currentId}
        onValueChange={(id) => dispatch(layoutActions.setCurrentStage(id))}
        options={stages.map((stage) => ({
          value: stage.id,
          // `⌾` is the same marker the workspace strip uses for a code-defined
          // object, so one glyph means one thing at both levels.
          label: stage.pinned ? `⌾ ${stage.name}` : stage.name,
        }))}
      />
      <IconButton
        variant="framed"
        size="tiny"
        glyph="▾"
        label="this stage's verbs"
        title="export, import, inspect — the same menu as a right-click"
        onClick={(event) => {
          // `stopPropagation` for the same reason `Presentation.onClick` does
          // it: an open object menu installs a window-level click listener that
          // closes it, and that listener runs AFTER this handler. Without this,
          // clicking ▾ while any menu is open opens the stage menu and closes
          // it again in the same event, and the button appears to do nothing.
          event.stopPropagation();
          const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
          pbui.openMenu("stage", value, box.left, box.bottom);
        }}
      />
    </span>
  );
}
