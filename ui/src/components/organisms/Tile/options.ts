import type { AppDescriptor } from "../../../appkit/registry";
import type { SelectOption } from "../../atoms";

/**
 * What the tile's application picker offers, and why an entry is unavailable.
 *
 * Extracted as a pure function beside the component because it carries three
 * rules that interact, and every one of them has a failure mode that is
 * invisible in a screenshot.
 *
 * ## 1. The tile's own application is always in the list, and never disabled
 *
 * The rule predates this ticket and the reason is in `Tile.tsx`: a `<select>`
 * whose value matches no option renders blank and silently reassigns on the
 * next change, so a seeded layout naming an out-of-scope application would lose
 * that tile the first time anyone touched the dropdown. With three composed
 * scopes instead of one, the chance of a layout naming an out-of-scope
 * application goes up, not down.
 *
 * It must not be *disabled* either, for the same reason one level down: a
 * selected `<option disabled>` is legal HTML and displays, but it reads as
 * "this tile is showing something it may not show", which is not what is meant.
 * The tile is showing it; the picker is saying what else you may make it.
 *
 * ## 2. A singleton already open elsewhere is disabled with a reason
 *
 * Not removed. `verbs.ts` argues this for verbs and it holds for options: a
 * user who never sees `trace` in the list does not learn that it is a
 * singleton, they conclude the application is missing or that they imagined it.
 *
 * ## 3. Stage and workspace scope grey out; instance scope has already filtered
 *
 * `apps` arrives instance-filtered, and `reasonFor` reports the stage's and the
 * workspace's narrowing. The asymmetry is deliberate and fits in a sentence: a
 * stage is somewhere you are and can leave; an instance is what this page is,
 * and you cannot. A tour section teaching four applications should show four —
 * the list is the lesson's vocabulary, and twenty-five greyed rows are noise.
 */
export interface PickerInput {
  /** The registry, already narrowed by the instance's allow-list. */
  apps: readonly AppDescriptor[];
  /** The descriptor for this tile's application, or null if unknown. */
  own: AppDescriptor | null;
  /** The application id this tile currently holds. */
  ownApp: string;
  /** Application ids held by OTHER tiles in this workspace. */
  elsewhere: ReadonlySet<string>;
  /** Why the stage or the workspace does not offer an application. */
  reasonFor(id: string): string | undefined;
}

export function pickerOptions({
  apps,
  own,
  ownApp,
  elsewhere,
  reasonFor,
}: PickerInput): SelectOption[] {
  const listed = apps.some((app) => app.id === ownApp) ? apps : [...(own ? [own] : []), ...apps];

  return listed.map((app) => {
    if (app.id === ownApp) return { value: app.id, label: app.title };
    if (app.singleton && elsewhere.has(app.id)) {
      return {
        value: app.id,
        label: app.title,
        disabled: true,
        reason: "already open in this workspace",
      };
    }
    const scope = reasonFor(app.id);
    if (scope) return { value: app.id, label: app.title, disabled: true, reason: scope };
    return { value: app.id, label: app.title };
  });
}
