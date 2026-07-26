import { registerApp, type AppProps } from "../../appkit/registry";
import { useTourContent } from "../../appkit/TourContent";
import { BriefChecklist } from "../../components/organisms";
import { EmptyState } from "../../components/molecules";

/**
 * The capstone brief, as a tile.
 *
 * Same reasoning as the lesson rail: the brief asks the reader to put a table
 * beside a chart on one document, and a brief that cannot itself be moved out
 * of the way while they do it is asking for something it will not allow.
 */
function BriefApp(_props: AppProps) {
  const { brief, onReset } = useTourContent();

  if (!brief) {
    return (
      <EmptyState
        message="No brief here"
        hint="This tile shows a tour section's capstone. Opened outside one, there is nothing to be finished."
      />
    );
  }

  return (
    <BriefChecklist
      question={brief.question}
      goals={brief.goals}
      hints={brief.hints}
      onReset={onReset}
    />
  );
}

registerApp({
  id: "brief",
  title: "the brief",
  tone: "var(--pbui-tone-chart)",
  docBound: false,
  Component: BriefApp,
});
