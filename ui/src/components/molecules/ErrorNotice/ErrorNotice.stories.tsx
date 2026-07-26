import type { Meta, StoryObj } from "@storybook/react-vite";
import { ErrorNotice } from "./ErrorNotice";
import { Stack } from "../../layout";
import { Text } from "../../foundation";

/**
 * Nine sites wrote `<Text tone="danger">{error}</Text>`, so colour alone was
 * carrying the fact that this line is an error rather than a caption. To a
 * screen reader, and on a monochrome display, a red sentence and a grey one are
 * the same sentence.
 */
const meta = {
  title: "Component Library/Molecules/ErrorNotice",
  component: ErrorNotice,
  parameters: { tile: false },
  args: { message: "could not mint the token" },
} satisfies Meta<typeof ErrorNotice>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The real messages, from the sites this replaced. */
export const TheRealMessages: Story = {
  render: () => (
    <Stack gap={3}>
      <ErrorNotice message="no datadrop account has that address yet" />
      <ErrorNotice message="could not mint the token" />
      <ErrorNotice message="Could not list drops. If this server requires a token, enter one above." />
      <ErrorNotice size="tiny" message="a log scale needs a strictly positive y domain" />
    </Stack>
  ),
};

/**
 * Announced, not just coloured.
 *
 * `role="alert"` because every one of these is a response to something the user
 * just did — a failed mint, a rejected upload, an address with no account
 * behind it. A `status` region would be announced too late to be a response.
 */
export const CarriesWithoutColour: Story = {
  render: () => (
    <Stack gap={3}>
      <ErrorNotice message="could not mint the token" />
      <Text size="tiny" tone="faint" prose>
        The ✕ glyph is the primary signal, the announcement is the accessible one, and the colour
        reinforces. Compare with a plain faint caption: on a greyscale display only one of the two
        is identifiable as an error.
      </Text>
    </Stack>
  ),
};
