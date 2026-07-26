import { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { appFor } from "../../../appkit/registry";
import { useAppScope } from "../../../appkit/AppScope";
import { Presentation, usePbui } from "../../../pbui";
import type { RootState } from "../../../store";
import { countLeaves, layoutActions, type Node } from "../../../store/layout";
import { Text } from "../../foundation";
import { IconButton, SelectInput } from "../../atoms";
import { InlineRename } from "../../molecules";
import { useDrag } from "./useDrag";
import { pickerOptions } from "./options";
import styles from "./Tile.module.css";

/**
 * One tile: a title bar and an application.
 *
 * The tile holds `app` and `docId` and nothing else (DR-11). Everything the
 * application shows lives in the world, which is why swapping two tiles is a
 * two-field exchange and closing one loses nothing.
 */
export function Tile({ node }: { node: Extract<Node, { type: "leaf" }> }) {
  const dispatch = useDispatch();
  const pbui = usePbui();
  const app = appFor(node.app);
  const [renaming, setRenaming] = useState(false);
  const docName = useSelector((state: RootState) =>
    node.docId ? (state.world.docs[node.docId]?.name ?? null) : null,
  );
  const tree = useSelector(
    (state: RootState) =>
      state.layout.spaces.find((s) => s.id === state.layout.currentSpaceId)?.tree ?? null,
  );
  const canClose = tree !== null && countLeaves(tree) > 1;

  const { dragging, zone, onGripPointerDown, register } = useDrag(node.id);
  // The applications this instance offers (DR-53), plus the reasons the stage
  // and the workspace give for the ones they do not (DATADROP-8 DR-61).
  const { apps: scopedApps, reasonFor } = useAppScope();

  /** Application ids held by the OTHER tiles in this workspace. */
  const elsewhere = useMemo(() => {
    const found = new Set<string>();
    const walk = (n: Node | null) => {
      if (!n) return;
      if (n.type === "leaf") {
        if (n.id !== node.id) found.add(n.app);
        return;
      }
      walk(n.a);
      walk(n.b);
    };
    walk(tree);
    return found;
  }, [tree, node.id]);

  const options = useMemo(
    () => pickerOptions({ apps: scopedApps, own: app, ownApp: node.app, elsewhere, reasonFor }),
    [scopedApps, app, node.app, elsewhere, reasonFor],
  );

  const title = app ? app.title : node.app;
  const derived = docName ? `${title} · ${docName}` : title;
  // `??` and not `||`: an empty label is normalised to undefined by the
  // reducer, so `??` is what makes "clear the field and press Enter" mean *go
  // back to the derived title* rather than *render an empty title bar*.
  const label = node.label ?? derived;

  const zoneStyle =
    zone === "left"
      ? { left: 0, top: 0, bottom: 0, width: "50%" }
      : zone === "right"
        ? { right: 0, top: 0, bottom: 0, width: "50%" }
        : zone === "top"
          ? { top: 0, left: 0, right: 0, height: "50%" }
          : zone === "bottom"
            ? { bottom: 0, left: 0, right: 0, height: "50%" }
            : zone === "center"
              ? { inset: 0 }
              : null;

  const Component = app?.Component;

  return (
    <section
      ref={register}
      // A landmark per tile, named by its application and document, so the
      // workspace is navigable by region rather than by tabbing through it.
      aria-label={label}
      className={[styles.tile, dragging ? styles.dragging : ""].filter(Boolean).join(" ")}
      style={{ background: app ? undefined : "var(--pbui-pane-alt)" }}
    >
      {zoneStyle && (
        <div className={styles.zone} style={zoneStyle}>
          <span className={styles.zoneLabel}>
            {zone === "center" ? "⇄ swap applications" : "split-dock here · the source tile closes"}
          </span>
        </div>
      )}

      <div className={styles.title} style={{ background: app?.tone ?? "var(--pbui-pane-alt)" }}>
        <span
          className={styles.grip}
          onPointerDown={onGripPointerDown}
          onMouseEnter={() =>
            pbui.setMouseDoc(
              "drag ⠿ — drop on a tile's CENTRE to swap applications, or near an EDGE to split-dock",
            )
          }
          onMouseLeave={() => pbui.setMouseDoc(null)}
          aria-hidden="true"
        >
          ⠿
        </span>

        {renaming ? (
          // The same control the workspace strip uses, for the same gesture at
          // the level below it. Two interactions that look the same should be
          // the same component — and this one already handles the
          // read-on-Enter / Escape-means-never-happened semantics.
          <InlineRename
            initial={node.label ?? ""}
            label="tile name"
            // Empty commits as empty, which the reducer normalises back to
            // "no label". `InlineRename`'s fallback exists for a workspace,
            // where a blank name leaves nothing to click; a tile always has a
            // derived title to fall back to, so clearing is a real outcome.
            fallback=""
            onCommit={(name) => {
              dispatch(layoutActions.renameLeaf({ nodeId: node.id, label: name }));
              setRenaming(false);
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <Presentation
            ptype="tile"
            value={node.id}
            doc={`<tile> ${label}`}
            /*
             * Rename is the tile title's DEFAULT VERB, not a double-click.
             *
             * The workspace strip renames on double-click because its left
             * button already means "switch to it". A tile title had no default
             * verb, so `Presentation` fell back to its rule for chips with no
             * obvious primary action — the left button opens the menu too —
             * and a double-click therefore opened the menu, closed it, and
             * opened it again. The rename never fired, which is not something
             * a unit test can see: it needs a real click on a real menu.
             *
             * Making it the default verb fixes three things at once. The
             * gesture works; the mouse-doc line announces "L: rename it   R:
             * menu" before the user commits; and Enter on the focused
             * presentation renames, which is the keyboard route the strip's
             * equivalent still does not have. A double-click also still works —
             * its first click enters the field and its second lands in it.
             */
            onActivate={() => setRenaming(true)}
            activateDoc="rename it"
          >
            <span
              style={{ textTransform: "uppercase", letterSpacing: "var(--pbui-track-label)" }}
              title={node.label ? `renamed — the derived title is “${derived}”` : undefined}
            >
              <Text size="tiny" strong>
                {label}
              </Text>
            </span>
          </Presentation>
        )}

        <span style={{ flex: 1 }} />

        <SelectInput
          label="application"
          variant="framed"
          size="tiny"
          value={node.app}
          onValueChange={(app) => dispatch(layoutActions.setLeafApp({ nodeId: node.id, app }))}
          onPointerDown={(event) => event.stopPropagation()}
          options={options}
        />

        <TileButton
          label="split right"
          onClick={() => dispatch(layoutActions.splitLeaf({ nodeId: node.id, dir: "row" }))}
        >
          ⬌
        </TileButton>
        <TileButton
          label="split below"
          onClick={() => dispatch(layoutActions.splitLeaf({ nodeId: node.id, dir: "col" }))}
        >
          ⬍
        </TileButton>
        <TileButton
          label="close tile"
          disabled={!canClose}
          onClick={() => dispatch(layoutActions.closeLeaf(node.id))}
        >
          ✕
        </TileButton>
      </div>

      <div className={styles.body}>
        {Component ? (
          <Component leafId={node.id} docId={node.docId} />
        ) : (
          <div style={{ padding: "var(--pbui-space-4)" }}>
            <Text size="small" tone="faint">
              no application called “{node.app}” — choose one above
            </Text>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * The tile's own chrome buttons: split, swap, close.
 *
 * Now a thin wrapper over IconButton rather than its own `<button>`. It stays a
 * local component only because every one of them is framed, tiny and takes a
 * glyph — three defaults repeated six times in the title bar.
 */
function TileButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <IconButton
      variant="framed"
      size="tiny"
      glyph={children}
      label={label}
      disabled={disabled}
      onClick={onClick}
    />
  );
}
