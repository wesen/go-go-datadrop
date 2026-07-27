import type { Meta, StoryObj } from "@storybook/react-vite";
import { SourcePanel } from "./SourcePanel";
import { readings } from "../../../fixtures";

const noop = () => {};

/**
 * The source browser.
 *
 * Its interesting states are all about *absence* — no credential, no drops, no
 * streams, no committed version — and every one of them needs a differently
 * configured server to reach by clicking. That is what makes this panel worth
 * extracting: the populated case is the least informative story here.
 */
const meta = {
  title: "Component Library/Organisms/SourcePanel",
  component: SourcePanel,
  parameters: { tile: { width: 480, height: 560 }, pbui: { table: readings } },
  args: {
    token: "",
    drops: [
      { name: "lab", public_read: false },
      { name: "field-trial", public_read: false },
      { name: "public-weather", public_read: true },
    ],
    chosenDrop: "lab",
    streams: ["temps", "humidity"],
    datasets: ["readings", "census"],
    chosenDataset: "readings",
    files: ["readings.csv", "data/2026/counts.csv"],
    latestVersion: 3,
    limit: 2000,
    onTokenChange: noop,
    onDropChange: noop,
    onDatasetChange: noop,
    onLimitChange: noop,
  },
} satisfies Meta<typeof SourcePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {};

/**
 * **The awkward mode**: the drop listing failed.
 *
 * Almost always a missing or wrong credential, so the message says what to do
 * rather than what happened. Reaching this by clicking needs a server with
 * private drops and no token; reaching it here needs one prop.
 */
export const CouldNotListDrops: Story = {
  args: { error: true, drops: [], streams: [], datasets: [], files: [], latestVersion: null },
};

/**
 * A server that is reachable and genuinely empty.
 *
 * Distinct from the error above, and the distinction matters: one says "you
 * cannot see anything", the other says "there is nothing". Rendering them the
 * same way is how a permissions problem gets diagnosed as an empty database.
 */
export const NoDropsAtAll: Story = {
  args: { drops: [], chosenDrop: "", streams: [], datasets: [], files: [], latestVersion: null },
};

/** A drop with no streams — ordinary for a dataset-only drop. */
export const NoStreams: Story = { args: { streams: [] } };

/** A drop with no datasets — ordinary for a stream-only drop. */
export const NoDatasets: Story = {
  args: { datasets: [], chosenDataset: "", files: [], latestVersion: null },
};

/**
 * A dataset whose only version is still a draft.
 *
 * `latestVersion` is set and the file list is empty, which is the state an
 * interrupted upload leaves behind — the version exists, nothing has been
 * committed into it, and the message says which version it is looking at.
 */
export const NoFilesInTheVersion: Story = { args: { files: [] } };

/** A token entered. The field is a password input; nothing echoes it. */
export const WithAToken: Story = { args: { token: "ddp_exampleexampl_example" } };

/** Every row budget, so the selected state is visible against the others. */
export const LargestBudget: Story = { args: { limit: 50000 } };
