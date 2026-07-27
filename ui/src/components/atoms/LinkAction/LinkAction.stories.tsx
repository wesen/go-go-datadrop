import type { Meta, StoryObj } from "@storybook/react-vite";
import { LinkAction } from "./LinkAction";
import { Button } from "../Button";
import { Stack } from "../../layout";
import { Text } from "../../foundation";

const meta = {
  title: "Design System/Atoms/LinkAction",
  component: LinkAction,
  parameters: { tile: false },
  args: { href: "#", children: "Sign in →" },
} satisfies Meta<typeof LinkAction>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TheSignInAffordances: Story = {
  render: () => (
    <Stack gap={3}>
      <Stack direction="row" gap={4}>
        <LinkAction href="/v1/auth/login?return=%2Fui%2F">Sign in →</LinkAction>
        <LinkAction href="/v1/auth/login?intent=signup&return=%2Fui%2F">
          Create an account →
        </LinkAction>
      </Stack>
      <Text size="tiny" tone="faint" prose>
        These are `&lt;a href&gt;` and must be: an OIDC authorization request is a top-level
        navigation, and the provider answers with an HTML login page on another origin. Attempting
        it with fetch is the standard afternoon lost to CORS.
      </Text>
    </Stack>
  ),
};

/**
 * Beside a Button, which is the comparison that matters.
 *
 * If these two ever diverge visually, the sign-in affordance stops reading as
 * an action of the same kind as everything else in the workbench.
 */
export const MatchesButton: Story = {
  render: () => (
    <Stack gap={3}>
      <Stack direction="row" gap={3} align="center">
        <LinkAction href="#" variant="framed">
          a LinkAction
        </LinkAction>
        <Button variant="framed">a Button</Button>
      </Stack>
      <Stack direction="row" gap={3} align="center">
        <LinkAction href="#">a LinkAction</LinkAction>
        <Button>a Button</Button>
      </Stack>
      <Text size="tiny" tone="faint" prose>
        Same border, same padding, same weight, same font size. Only the element differs, and only
        because it has to.
      </Text>
    </Stack>
  ),
};
