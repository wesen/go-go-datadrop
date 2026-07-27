import { useDispatch } from "react-redux";
import { registerApp, type AppProps } from "../../appkit/registry";
import { useTourContent } from "../../appkit/TourContent";
import { layoutActions } from "../../store/layout";
import { ModuleRack } from "../../components/organisms";
import { EmptyState } from "../../components/molecules";

/**
 * The module rack, as a tile.
 *
 * Choosing a card re-points `rackTarget` — a sibling tile — so the card and the
 * application it describes are on screen together and the reader can check the
 * description against the behaviour immediately.
 *
 * With no `rackTarget` the rack is a reference with no specimen. It still
 * reads; it teaches less.
 */
function ModulesApp(_props: AppProps) {
  const dispatch = useDispatch();
  const { modules, rackTarget } = useTourContent();

  if (!modules || modules.length === 0) {
    return (
      <EmptyState
        message="No module rack here"
        hint="This tile shows the application reference of a tour section."
      />
    );
  }

  return (
    <ModuleRack
      modules={modules}
      onSelect={
        rackTarget
          ? (app) => dispatch(layoutActions.setLeafApp({ nodeId: rackTarget, app }))
          : undefined
      }
    />
  );
}

registerApp({
  id: "modules",
  title: "modules",
  tone: "var(--pbui-tone-neutral)",
  docBound: false,
  duplicable: false,
  singleton: true,
  Component: ModulesApp,
});
