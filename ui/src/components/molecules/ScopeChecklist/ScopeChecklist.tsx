import { Stack } from "../../layout";
import { Text } from "../../foundation";
import { CheckboxRow } from "../../atoms";

/**
 * Which rights a token may exercise.
 *
 * A checklist rather than a multi-select, because the set is four items long
 * and the whole point is to see all four at once — including the ones you are
 * *not* granting. A collapsed control that reads "2 selected" hides the
 * question the user is actually answering.
 *
 * The sentence below the boxes is part of the component rather than the
 * caller's, because it states the property that makes scopes safe to hand out:
 * a scope narrows a credential and never widens it. Someone reading "admin"
 * without that sentence reasonably concludes the checkbox grants admin.
 */
export function ScopeChecklist({
  available,
  selected,
  onSelectedChange,
  disabled = false,
}: {
  available: readonly string[];
  selected: readonly string[];
  onSelectedChange(next: string[]): void;
  disabled?: boolean;
}) {
  return (
    <Stack gap={2} data-part="scope-checklist">
      <Stack direction="row" gap={3} wrap>
        {available.map((scope) => (
          <CheckboxRow
            key={scope}
            label={scope}
            disabled={disabled}
            checked={selected.includes(scope)}
            onCheckedChange={(next) =>
              onSelectedChange(next ? [...selected, scope] : selected.filter((s) => s !== scope))
            }
          />
        ))}
      </Stack>
      <Text size="tiny" tone="faint" prose>
        Scopes narrow what a token may do. They never grant more than you have: remove yourself from
        a drop and every token you hold loses it immediately.
      </Text>
    </Stack>
  );
}
