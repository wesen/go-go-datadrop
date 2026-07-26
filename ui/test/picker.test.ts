import { describe, expect, test } from "bun:test";
import type { AppDescriptor } from "../src/appkit/registry";
import { pickerOptions } from "../src/components/organisms/Tile/options";

/**
 * The tile's application picker: three rules that interact.
 *
 * Pure, so it is tested with literals and no DOM — which is the point of
 * extracting it out of `Tile.tsx` at all. Each of the three has a failure mode
 * that is invisible in a screenshot: an option missing looks like a shorter
 * list, and a selected option that is disabled looks like a normal select.
 */

const app = (id: string, extra: Partial<AppDescriptor> = {}): AppDescriptor =>
  ({
    id,
    title: id,
    tone: "var(--pbui-tone-neutral)",
    docBound: false,
    duplicable: false,
    singleton: false,
    Component: (() => null) as unknown as AppDescriptor["Component"],
    ...extra,
  }) as AppDescriptor;

const none = () => undefined;

describe("the tile's application picker", () => {
  test("a singleton already open elsewhere is disabled with a reason, not hidden", () => {
    const options = pickerOptions({
      apps: [app("chart", { duplicable: true }), app("trace", { singleton: true })],
      own: app("chart", { duplicable: true }),
      ownApp: "chart",
      elsewhere: new Set(["trace"]),
      reasonFor: none,
    });
    const trace = options.find((option) => option.value === "trace");
    expect(trace).toBeDefined();
    expect(trace?.disabled).toBe(true);
    expect(trace?.reason).toBe("already open in this workspace");
  });

  test("a singleton NOT open elsewhere is offered", () => {
    const options = pickerOptions({
      apps: [app("chart"), app("trace", { singleton: true })],
      own: app("chart"),
      ownApp: "chart",
      elsewhere: new Set(),
      reasonFor: none,
    });
    expect(options.find((option) => option.value === "trace")?.disabled).toBeUndefined();
  });

  test("a non-singleton may appear many times", () => {
    const options = pickerOptions({
      apps: [app("chart", { duplicable: true }), app("launcher")],
      own: app("chart", { duplicable: true }),
      ownApp: "chart",
      elsewhere: new Set(["launcher", "chart"]),
      reasonFor: none,
    });
    expect(options.find((option) => option.value === "launcher")?.disabled).toBeUndefined();
  });

  test("the stage's reason greys an application out and says which stage", () => {
    const options = pickerOptions({
      apps: [app("chart"), app("tokens")],
      own: app("chart"),
      ownApp: "chart",
      elsewhere: new Set(),
      reasonFor: (id) => (id === "tokens" ? "not offered by the work stage" : undefined),
    });
    const tokens = options.find((option) => option.value === "tokens");
    expect(tokens?.disabled).toBe(true);
    expect(tokens?.reason).toBe("not offered by the work stage");
  });

  test("the tile's own application is listed even when the scope excludes it", () => {
    // A select whose value matches no option renders blank and silently
    // reassigns on the next change, so a seeded layout naming an out-of-scope
    // application would lose that tile the first time anyone touched it.
    const options = pickerOptions({
      apps: [app("chart"), app("table")],
      own: app("tokens"),
      ownApp: "tokens",
      elsewhere: new Set(),
      reasonFor: () => "not offered by the work stage",
    });
    expect(options.map((option) => option.value)).toContain("tokens");
  });

  test("the tile's own application is never disabled, whatever the rules say", () => {
    // A selected <option disabled> is legal and displays, and reads as "this
    // tile is showing something it may not show" — which is not what is meant.
    const options = pickerOptions({
      apps: [app("trace", { singleton: true })],
      own: app("trace", { singleton: true }),
      ownApp: "trace",
      // Another tile also holds `trace`, which should not disable this one's
      // own entry.
      elsewhere: new Set(["trace"]),
      reasonFor: () => "not offered by the work stage",
    });
    const trace = options.find((option) => option.value === "trace");
    expect(trace?.disabled).toBeUndefined();
    expect(trace?.reason).toBeUndefined();
  });

  test("an empty scope still offers the tile's own application", () => {
    // The blank-picker failure mode: compose an instance scope and a stage
    // scope with no overlap and `apps` is empty.
    const options = pickerOptions({
      apps: [],
      own: app("chart"),
      ownApp: "chart",
      elsewhere: new Set(),
      reasonFor: none,
    });
    expect(options).toEqual([{ value: "chart", label: "chart" }]);
  });

  test("an unknown application still produces a usable picker", () => {
    // `own` is null when a bundle named an application this build does not
    // have. The tile renders its "no application called …" state and the picker
    // must still offer a way out.
    const options = pickerOptions({
      apps: [app("chart")],
      own: null,
      ownApp: "chartsy",
      elsewhere: new Set(),
      reasonFor: none,
    });
    expect(options.map((option) => option.value)).toEqual(["chart"]);
  });
});
