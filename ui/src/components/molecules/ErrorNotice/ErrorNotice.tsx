import { Stack } from "../../layout";
import { Text } from "../../foundation";
import { StateGlyph } from "../../atoms";

/**
 * Something went wrong, said once, in the place it went wrong.
 *
 * Nine sites wrote `<Text tone="danger">{error}</Text>`. Colour alone was
 * carrying the fact that this line is an error rather than a caption, which is
 * the rule `Chip.module.css` names: on a monochrome display, or to a screen
 * reader, a red sentence and a grey one are the same sentence.
 *
 * So the glyph carries it, `role="alert"` announces it, and the colour
 * reinforces. `role="alert"` rather than `status` because these are all
 * responses to something the user just did — a failed mint, a rejected upload,
 * an address with no account behind it.
 */
export function ErrorNotice({
  message,
  size = "small",
}: {
  message: string;
  size?: "tiny" | "small";
}) {
  return (
    <Stack direction="row" gap={2} align="baseline" data-part="error-notice">
      <StateGlyph state="error" label="error" />
      <Text size={size} tone="danger" as="span">
        <span role="alert">{message}</span>
      </Text>
    </Stack>
  );
}
