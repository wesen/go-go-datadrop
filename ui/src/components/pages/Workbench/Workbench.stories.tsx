import type { Meta, StoryObj } from "@storybook/react-vite";
import { Workbench } from "./Workbench";

/**
 * The whole shell.
 *
 * The one story in the tree that is an integration test rather than a component
 * story: the workspace strip, the tiling, the applications, the object menu,
 * the accept banner and the mouse-doc line, all at once, over a real store.
 *
 * It earns its place because two properties are only visible here. First, the
 * landmark structure — the a11y `region` rule is disabled everywhere else
 * because a story renders a fragment with no page shell, and this is the one
 * place the shell exists to be checked. Second, the shell's own gate: a
 * signed-out visitor sees one thing, not fifteen tiles of nothing.
 *
 * It is deliberately the *only* page-level story. Page stories test
 * integration, not components, and they would not have caught any of the three
 * DATADROP-5 defects — every one of those was a state of a subcomponent.
 */
const meta = {
  title: "Applications/Workbench",
  component: Workbench,
  parameters: {
    tile: false,
    // The shell IS the landmark structure, so the rule that is switched off
    // globally is switched back on here.
    a11y: { config: { rules: [{ id: "region", enabled: true }] } },
  },
} satisfies Meta<typeof Workbench>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
