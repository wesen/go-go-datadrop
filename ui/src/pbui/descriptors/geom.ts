import type { Geom } from "../../model/chart";
import type { PresentationDescriptor } from "../registry";
import type { Action } from "../verbs";

/** `<geom>` — a geometry, and the type requirements it states about itself. */
export const geomDescriptor: PresentationDescriptor<Geom> = {
  ptype: "geom",
  tone: "var(--pbui-tone-geom)",

  label: (geom) => `geom_${geom}`,

  describe: (geom) => ({
    presentationType: "geom",
    geom,
    // A geom that states its own requirements is a geom whose refusal to draw
    // is explicable before you try it.
    needs:
      geom === "bar"
        ? "a nominal or temporal x, and a quantitative y"
        : "any x, and a quantitative y",
    baseline: geom === "bar" || geom === "area" ? "zero — otherwise magnitude is misrepresented" : "none",
  }),

  actions: (geom, env): Action[] => [
    {
      label: `Use this geom  (chart ${env.nameOf(env.activeDocId)})`,
      verb: { kind: "setGeom", docId: env.activeDocId, geom },
    },
    { label: "Inspect", verb: { kind: "inspect", ptype: "geom", value: geom } },
  ],
};
