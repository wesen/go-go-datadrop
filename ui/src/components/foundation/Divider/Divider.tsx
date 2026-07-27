import styles from "./Divider.module.css";

/**
 * A rule.
 *
 * §10.3 rule 9: solid rules *bound* things and are therefore borders on the
 * thing they bound; dashed and dotted rules *separate* things and are this
 * component. Keeping the distinction visible is what stops the interface
 * turning into a grid of boxes.
 */
export function Divider({
  variant = "dashed",
  orientation = "horizontal",
  spacing = "space-3",
}: {
  variant?: "dashed" | "dotted";
  orientation?: "horizontal" | "vertical";
  spacing?: "none" | "space-2" | "space-3" | "space-4";
}) {
  return (
    <hr
      data-part="divider"
      aria-orientation={orientation}
      className={[styles.divider, styles[variant], styles[orientation], styles[spacing]].join(" ")}
    />
  );
}
