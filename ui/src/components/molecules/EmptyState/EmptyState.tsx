import { Stack } from "../../layout";
import { Text } from "../../foundation";

/**
 * Nothing here, and why.
 *
 * Nine sites wrote a bare `<Text size="small" tone="faint">none yet</Text>`.
 * That is the right *look* and the wrong content: "none yet" answers "is this
 * broken?" and leaves "what do I do about it?" unanswered, which is the only
 * question an empty list actually raises.
 *
 * `hint` is therefore not decoration. `SelectInput`'s empty story shows the
 * case: a first-day account with no writable drops sees "you are not a writer
 * on any drop yet" — the message says what is true, and the hint has to say
 * what to do about it.
 */
export function EmptyState({
  message,
  hint,
  size = "small",
}: {
  message: string;
  /** What to do about it. Omit only when there is genuinely nothing to do. */
  hint?: string;
  size?: "tiny" | "small";
}) {
  return (
    <Stack gap={1} data-part="empty-state">
      <Text size={size} tone="faint">
        {message}
      </Text>
      {hint && (
        <Text size="tiny" tone="faint" prose>
          {hint}
        </Text>
      )}
    </Stack>
  );
}
