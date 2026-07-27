import type { StorybookConfig } from "@storybook/react-vite";

/**
 * Storybook is the development surface for phases 0 to 2, when there is no
 * assembled application to run (DR-17). It is not a supplementary artifact
 * here: a component without a story is a component nobody has ever seen.
 *
 * The story hierarchy mirrors the layer decomposition of §10.2, so the sidebar
 * reads as the dependency order:
 *
 *   Design System/Foundation      tokens made usable in React
 *   Design System/Layout          structural primitives
 *   Component Library/Atoms       chips and controls
 *   Component Library/Molecules   composed, reusable UI
 *   Component Library/Organisms   tile applications and shell chrome
 *   Applications/Pages            whole workspaces
 */
const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],
  framework: { name: "@storybook/react-vite", options: {} },
  // The application is served from /static/ by pkg/webui, which is why
  // vite.config.ts sets base and outDir into the Go tree. Storybook is never
  // served by Go and never embedded, so it overrides both back to defaults —
  // without this it would inherit outDir and write over the embedded bundle.
  viteFinal: async (config) => ({
    ...config,
    base: "/",
    build: { ...config.build, outDir: undefined, emptyOutDir: false },
  }),
};

export default config;
