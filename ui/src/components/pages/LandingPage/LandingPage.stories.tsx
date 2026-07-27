import type { Meta, StoryObj } from "@storybook/react-vite";
import { LandingPage } from "./LandingPage";

/**
 * The whole tour: six sandboxed workbenches down one scrolling page.
 *
 * **Everything below is the real application.** Not screenshots, not a demo
 * mode — the same `WorkbenchShell` the product renders, six times, each over
 * its own store, answering from committed fixtures rather than from a server.
 * They share a module graph, a registry, a stylesheet and nothing else.
 *
 * Worth doing by hand, in this order:
 *
 *  1. Right-click a mark in the hero chart and choose **Exclude …**. A filter
 *     step appears in the pipeline beside it. That is the whole system.
 *  2. Scroll to §A and press ▶ on a step: grey tick, WATCHED. Then do the same
 *     move by hand in another section: green.
 *  3. In §D, pick a module card and watch the large tile become it.
 *  4. Press ↺ on any section. The world and the ticks go back together.
 *  5. Add a document in §B, then scroll to §C and confirm it is not there.
 *
 * **Stop the API server before reading this.** If anything on the page needs
 * it, DR-48 has failed.
 */
const meta = {
  title: "Applications/Tour/Page",
  component: LandingPage,
  parameters: {
    tile: false,
    layout: "fullscreen",
    pbui: false,
    a11y: { config: { rules: [{ id: "region", enabled: true }] } },
  },
} satisfies Meta<typeof LandingPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
