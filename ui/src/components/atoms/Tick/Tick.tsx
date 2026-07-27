import styles from "./Tick.module.css";

/**
 * A lesson step's completion marker: a number, or a tick you earned, or a tick
 * you watched.
 *
 * The three states are the whole point, and the third is the one worth having.
 * `watched` means the reader pressed **▶ do it for me** and the predicate then
 * went true — so the step is complete, but they saw it happen rather than made
 * it happen. It renders in line-grey with a WATCHED label beside it rather than
 * in green, because watching is not the same as knowing, and a tutorial that
 * cannot tell the difference is measuring clicking.
 *
 * Colour is reinforcement, never the signal (WCAG 1.4.1, and the rule
 * `Chip.module.css` states first): pending shows a *number*, complete shows a
 * *tick*, and `watched` carries its own text label. Print the rail in greyscale
 * and the three states are still three different things.
 *
 * Extracted from `apps/tutorials/Tutorial.tsx`, where it had been an eleven-
 * property inline `style` object since DATADROP-4. Worth knowing why nothing
 * caught it: `no-raw-controls.test.ts` rule 4 matches
 * `const \w+: CSSProperties`, and an inline literal in JSX is not a typed const
 * declaration. The guard has a real gap and this only closes one instance of it.
 */
export type TickState = "pending" | "self" | "watched";

export function Tick({ state, n, label }: { state: TickState; n: number; label?: string }) {
  const described =
    label ??
    (state === "self"
      ? `step ${n}, complete`
      : state === "watched"
        ? `step ${n}, complete — watched`
        : `step ${n}, not started`);

  return (
    <span
      className={[styles.tick, styles[state]].join(" ")}
      role="img"
      aria-label={described}
      title={described}
    >
      {state === "pending" ? n : "✓"}
    </span>
  );
}
