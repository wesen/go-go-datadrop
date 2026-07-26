import type { Meta, StoryObj } from "@storybook/react-vite";
import { CheatCard } from "./CheatCard";
import { Kbd } from "../../foundation";

/**
 * The vocabulary of a tour section, in one place the reader can find again.
 *
 * Deliberately a table of terms rather than a summary. A reader who has just
 * finished the section does not need the argument repeated — they need to know
 * what the five things they just learned are *called*, so that the next time
 * one comes up they can name it.
 */
const meta = {
  title: "Component Library/Molecules/CheatCard",
  component: CheatCard,
  parameters: { tile: false },
  args: { title: "Objects", rows: [] },
} satisfies Meta<typeof CheatCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Objects: Story = {
  args: {
    rows: [
      ["hover", "the doc line names the object and what L and R will do"],
      ["left-click", "the default verb — or the menu, if the object has none"],
      ["right-click", "every verb this type has"],
      ["red banner", "a command is accepting an argument · Esc aborts"],
      [
        "the types",
        "field · source · doc · chart · step · datum · cat · geom · channel · tile · workspace",
      ],
    ],
  },
};

/**
 * With `Kbd` in the glosses.
 *
 * The term column is a plain string on purpose — it is the key, and it is what
 * the eye runs down when scanning for a half-remembered word. Rich markup
 * belongs in the gloss, where it names controls rather than labelling rows.
 */
export const Shell: Story = {
  args: {
    title: "Shell",
    rows: [
      ["⠿ drag", "centre swaps two applications · edge docks the tile there"],
      [
        "split & close",
        <>
          <Kbd>⬌</Kbd> split right · <Kbd>⬍</Kbd> split below · <Kbd>✕</Kbd> close (the document
          survives)
        </>,
      ],
      ["DOC strip", "which document this view shows · ＋ spawns a new one"],
      ["ACTIVE doc", "the target of verbs fired from object menus — the menu header names it"],
      ["workspaces", "independent layouts over one shared world"],
    ],
  },
};

/**
 * With a frame.
 *
 * Off by default, because the only place this ships is inside a tile and the
 * tile already draws a border and a title. This story exists so the default
 * reads as a choice rather than as an omission.
 */
export const Framed: Story = {
  args: { ...Objects.args, framed: true },
};

/** Two rows, to check the card does not need filling to look deliberate. */
export const Short: Story = {
  args: {
    title: "Grammar",
    rows: [
      ["the spec", "source ⊳ steps ↦ mapping · geom · scale"],
      ["steps", "filter · derive · group∑ · sort · limit — order is semantics"],
    ],
  },
};
