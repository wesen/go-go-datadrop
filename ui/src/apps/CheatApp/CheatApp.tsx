import { registerApp, type AppProps } from "../../appkit/registry";
import { useTourContent } from "../../appkit/TourContent";
import { AppBody } from "../../components/layout";
import { CheatCard, EmptyState } from "../../components/molecules";

/**
 * The section's vocabulary card, as a tile.
 *
 * It was a card printed under the section, which meant it left the screen the
 * moment the reader scrolled into the workbench to try something — precisely
 * when they want to look a term up. As a tile it stays beside the work, and a
 * reader who does not want it can close it.
 */
function CheatApp(_props: AppProps) {
  const { cheat } = useTourContent();

  if (!cheat) {
    return (
      <EmptyState
        message="No cheat sheet here"
        hint="This tile shows the vocabulary of a tour section. Opened outside one, there is none."
      />
    );
  }

  return (
    <AppBody>
      <CheatCard title={cheat.title} rows={cheat.rows} />
    </AppBody>
  );
}

registerApp({
  id: "cheat",
  title: "cheat sheet",
  tone: "var(--pbui-selected)",
  docBound: false,
  duplicable: false,
  singleton: true,
  Component: CheatApp,
});
