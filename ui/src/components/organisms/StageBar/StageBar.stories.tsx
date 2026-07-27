import type { Meta, StoryObj } from "@storybook/react-vite";
import { Provider } from "react-redux";
import { StageBar } from "./StageBar";
import { Stack, Surface, Toolbar } from "../../layout";
import { Text } from "../../foundation";
import { makeStore } from "../../../store";
import { defaultLayout } from "../../../store/stages";
import "../../../apps/all";

/**
 * The stage switcher, at the right end of the masthead.
 *
 * A stage is a named set of workspaces plus an application allow-list plus
 * chrome (DR-58). `work` is the product as it has always been; `welcome` is the
 * tutorial; `account` is where tokens and uploads live; `sign in` is where an
 * unauthenticated visitor is held.
 */
const meta = {
  title: "Component Library/Organisms/StageBar",
  component: StageBar,
  parameters: { tile: false },
} satisfies Meta<typeof StageBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A masthead exactly as the shell assembles it. */
function Masthead() {
  return (
    <Surface tone="inverted" border="none">
      <Toolbar tight>
        <Text size="title" strong>
          DATALAB
        </Text>
        <Text size="tiny" tone="faint">
          DATA · EXPLORE · INSPECT · UNDERSTAND
        </Text>
        <StageBar />
      </Toolbar>
    </Surface>
  );
}

/** The four pinned stages, in a masthead. */
export const Default: Story = {
  render: () => (
    <Stack gap={3}>
      <Masthead />
      <Text size="tiny" tone="faint" prose>
        ⌾ marks a stage defined in code — the same glyph the workspace strip uses one level down.
        Switching remembers each stage's workspace, so leaving `work` on `gallery` and coming back
        from `account` returns you to `gallery` rather than to `build`.
      </Text>
    </Stack>
  ),
};

/**
 * The awkward mode: a workbench with exactly one stage.
 *
 * Every embedded tour panel is this — six of them down the landing page, each
 * seeding one stage. A switcher that cannot switch is furniture that reads as a
 * control, so the bar drops to the name alone. This state is expensive to reach
 * by clicking and is two lines of preloaded state here.
 */
export const SingleStage: Story = {
  render: () => {
    const full = defaultLayout();
    // `work`, which `defaultLayout` always supplies; the non-null assertion is
    // a story's licence to assume its own fixture rather than handle it.
    const stage = full.stages.find((s) => s.id === full.currentStageId) as NonNullable<
      (typeof full.stages)[number]
    >;
    const store = makeStore({
      preloaded: {
        layout: {
          stages: [stage],
          currentStageId: stage.id,
          spaces: full.spaces.filter((space) => space.stageId === stage.id),
          currentSpaceId: stage.currentSpaceId,
        },
      },
    });
    return (
      <Provider store={store}>
        <Masthead />
      </Provider>
    );
  },
};
