import { registerApp, type AppProps } from "../../appkit/registry";
import { useTourContent } from "../../appkit/TourContent";
import { LessonRail } from "../../components/organisms";
import { EmptyState } from "../../components/molecules";

/**
 * The lesson rail, as a tile — the container half.
 *
 * A tour section seeds a workspace with this tile in it, so the rail can be
 * split, moved, re-pointed and closed like any other application. That is a
 * better argument for the tiling model than any lesson about it: the thing
 * teaching you about tiles is itself a tile.
 *
 * The content comes from `TourContent` rather than from props, because a tile
 * names its application by id and carries nothing else (DR-11). Everything an
 * application shows lives in the world or in the instance's context, never in
 * the tile.
 */
function LessonsApp(_props: AppProps) {
  const { lessons, onReset } = useTourContent();

  if (!lessons || lessons.length === 0) {
    return (
      <EmptyState
        message="No lessons here"
        hint="This tile shows the lesson rail of a tour section. Opened outside one, it has nothing to teach."
      />
    );
  }

  return <LessonRail lessons={lessons} onReset={onReset} />;
}

registerApp({
  id: "lessons",
  title: "lessons",
  tone: "var(--pbui-tone-step)",
  docBound: false,
  Component: LessonsApp,
});
