import type { ReactNode } from "react";
import { Stack, Surface, Toolbar } from "../../layout";
import { Text } from "../../foundation";

/**
 * A bordered aside that reports a state and offers what to do about it.
 *
 * Three of these existed inline, all as `<Surface tone="alt" role="status">`:
 * the unfinished-upload panel, the published-successfully panel, and the
 * secure-context warning. They are the same shape — a title, a body, sometimes
 * actions — and none of them announced itself the same way.
 *
 * The variant chooses the left edge and the role. `warning` and `ok` are
 * distinguishable without colour by the edge width and the title weight; that
 * is deliberate and it is why there is no `danger` variant here — a *failure*
 * is `ErrorNotice`, which announces as an alert. A Callout reports a state that
 * is merely worth knowing.
 */
export function Callout({
  variant = "info",
  title,
  children,
  actions,
}: {
  variant?: "info" | "ok" | "warning";
  title?: string;
  children: ReactNode;
  /** Buttons. Rendered in a tight toolbar below the body. */
  actions?: ReactNode;
}) {
  return (
    <Surface tone="alt" border="hair" padding={3} role="status" data-part="callout">
      <Stack gap={2}>
        {title && (
          <Text size="small" strong>
            {variant === "ok" ? "✓ " : variant === "warning" ? "⚠ " : ""}
            {title}
          </Text>
        )}
        {children}
        {actions && <Toolbar tight>{actions}</Toolbar>}
      </Stack>
    </Surface>
  );
}
