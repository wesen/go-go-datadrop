import { useEffect, useRef, useState } from "react";
import "../../../apps/all";
import { Button } from "../../atoms";
import { Text } from "../../foundation";
import { WorkbenchInstance } from "../WorkbenchInstance";
import { TourSection } from "../TourSection";
import {
  MODULES,
  TOUR_FIXTURES,
  briefGoals,
  briefHints,
  briefQuestion,
  briefSeed,
  grammarLessons,
  grammarSeed,
  heroSeed,
  layoutLessons,
  layoutSeed,
  objectsLessons,
  objectsSeed,
  rackSeed,
} from "../../../tour";
import styles from "./LandingPage.module.css";

/**
 * The tour: five sandboxed workbenches down one scrolling page.
 *
 * Every panel below is the real application. Not a screenshot, not a
 * simplified copy, not a demo mode — the same `WorkbenchShell` the product
 * renders, over its own store, answering from committed fixtures instead of
 * from a server (DR-48). That identity is the whole basis of the claim that the
 * tutorial is executable documentation: the moment a tour needs its own
 * `ChartApp`, a lesson can go stale without anything failing.
 *
 * Six stores are constructed here — the hero plus five sections — and they
 * share a module graph, a registry, a stylesheet and nothing else (DR-45).
 *
 * ## Applications are scoped per section
 *
 * §A offers seven, §C offers six, the brief offers everything. The tile
 * dropdown is a menu of *what this panel is for*, and offering the token
 * manager in a section about the grammar of graphics teaches that the two are
 * comparable choices.
 */

/** The vocabulary every section teaches, in the order the sections teach it. */
const NAV = [
  { id: "objects", tag: "A", label: "objects and verbs" },
  { id: "layout", tag: "B", label: "tiles and workspaces" },
  { id: "grammar", tag: "C", label: "the grammar" },
  { id: "modules", tag: "D", label: "the modules" },
  { id: "brief", tag: "✦", label: "the brief" },
];

const CHART_APPS = ["chart", "table", "pipeline", "encode", "sources", "launcher"] as const;

export function LandingPage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const [past, setPast] = useState(false);

  // The section index appears once the hero has scrolled away. An
  // IntersectionObserver rather than a scroll handler: one callback at the
  // boundary instead of one per frame for the length of the page.
  useEffect(() => {
    const element = heroRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setPast(!entry?.isIntersecting), {
      threshold: 0,
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const go = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const rack = rackSeed();
  // The rack drives the chart tile. Reaching into the seeded tree for its id is
  // the price of the tree being data rather than a builder with named slots;
  // it is read once, here, rather than threaded through the section.
  const rackTarget = firstLeafOfApp(rack.layout, "chart");

  return (
    <div className={styles.page}>
      <div className={styles.masthead}>
        <span className={styles.wordmark}>DATALAB</span>
        <span className={styles.tagline}>DATA · EXPLORE · INSPECT · UNDERSTAND</span>
      </div>

      <nav
        className={past ? `${styles.nav} ${styles.navOn}` : styles.nav}
        aria-label="tour sections"
        aria-hidden={!past}
      >
        <span className={styles.navLabel}>Tour</span>
        {NAV.map((entry) => (
          <Button
            key={entry.id}
            variant="framed"
            className={styles.navItem}
            tabIndex={past ? 0 : -1}
            onClick={() => go(entry.id)}
          >
            <b>{entry.tag}</b> · {entry.label}
          </Button>
        ))}
      </nav>

      <div className={styles.column}>
        <div ref={heroRef} className={styles.hero}>
          <div className={styles.eyebrow}>
            a workbench built on presentations · after Genera and CLIM
          </div>
          <h1 className={styles.headline}>The thing on screen is the thing.</h1>
          <div className={styles.lede}>
            <Text size="base" prose>
              Every label, chip, axis tick and mark below is a typed object with the real value
              attached — not a picture of one. Right-click a mark in the chart and choose{" "}
              <strong>Exclude …</strong>: a filter step is written into the pipeline beside it, and
              the chart redraws. That single move is the whole system. The rest of this page is four
              workspaces you can take apart.
            </Text>
          </div>

          <div className={styles.heroPanel}>
            <WorkbenchInstance
              config={{
                fixtures: TOUR_FIXTURES,
                preloaded: heroSeed(),
                apps: [...CHART_APPS],
                workspaces: false,
              }}
            />
          </div>

          <div className={styles.heroFoot}>
            {/*
              `raised` IS this treatment: firm border, hard shadow, a tone fill.
              It is the variant `tokens.css` anticipated — --pbui-shadow-hard
              carries the comment "buttons" — so the call-to-action needs a fill
              and nothing else.
            */}
            <Button variant="raised" fill="var(--pbui-selected)" onClick={() => go("objects")}>
              start the tour ↓
            </Button>
            <Text size="small" tone="faint">
              four tracks and a brief · every panel has its own world and its own ↺ reset
            </Text>
          </div>
        </div>

        <TourSection
          id="objects"
          tag="A"
          title="Objects and verbs"
          blurb={
            <>
              The one idea underneath everything: whatever is displayed stays a first-class handle
              on the real object. It carries its type, so it carries a menu of verbs appropriate to
              that type — and any command can pause and ask you to point at an argument, anywhere on
              screen. Three moves to learn: hover, right-click, accept.
            </>
          }
          config={{
            fixtures: TOUR_FIXTURES,
            preloaded: objectsSeed(),
            apps: [
              "sources",
              "inspector",
              "watch",
              "trace",
              "chart",
              "table",
              "lessons",
              "cheat",
              "launcher",
            ],
            workspaces: false,
          }}
          lessons={objectsLessons}
          cheat={{
            title: "Objects",
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
          }}
        />

        <TourSection
          id="layout"
          tag="B"
          title="Tiles, documents, workspaces"
          blurb={
            <>
              The confusion worth clearing up before anything else:{" "}
              <strong>tiles are windows, documents are the thing</strong>. A chart, table, pipeline
              or encoding tile is a <em>view</em> of one document, named in the DOC strip at its
              top. Point two tiles at the same document and they move together, because they are not
              copies. Then the layout itself — splitting, docking, whole workspaces — becomes safe
              to play with.
            </>
          }
          config={{
            fixtures: TOUR_FIXTURES,
            preloaded: layoutSeed(),
            apps: [...CHART_APPS, "charts", "inspector", "lessons", "cheat"],
          }}
          lessons={layoutLessons}
          cheat={{
            title: "Shell",
            rows: [
              ["⠿ drag", "centre swaps two applications · edge docks the tile there"],
              ["⬌ ⬍ ✕", "split right · split below · close (the document survives)"],
              ["DOC strip", "which document this view shows · ＋ spawns a new one"],
              [
                "ACTIVE doc",
                "the target of verbs fired from object menus — the menu header names it",
              ],
              ["workspaces", "independent layouts over one shared world"],
            ],
          }}
        />

        <TourSection
          id="grammar"
          tag="C"
          title="The grammar of graphics"
          blurb={
            <>
              A chart here is not a type you pick from a menu. It is a composition —{" "}
              <strong>source ⊳ steps ↦ mapping · geom · scale</strong> — and this panel shows all
              four parts at once, editable from either end. The left half is dplyr; the right half
              is <em>aes()</em>. Watch what happens when you ask for a geometry the data cannot
              support.
            </>
          }
          tall
          config={{
            fixtures: TOUR_FIXTURES,
            preloaded: grammarSeed(),
            apps: [...CHART_APPS, "lessons", "cheat"],
            workspaces: false,
          }}
          lessons={grammarLessons}
          cheat={{
            title: "Grammar",
            rows: [
              ["the spec", "source ⊳ steps ↦ mapping · geom · scale"],
              ["steps", "filter · derive · group∑ · sort · limit — order is semantics"],
              ["channels", "x · y · colour · size · facet"],
              ["geoms", "point · line · bar · area — each states its type requirements"],
              ["✓ on a step", "disables it in place, so you can A/B your own transform"],
            ],
          }}
        />

        <TourSection
          id="modules"
          tag="D"
          title="The modules"
          blurb={
            <>
              Twenty-five applications share one world. The distinction that makes them legible: if
              a tile carries a <strong>DOC strip</strong> it is a view of a single chart document
              and can be re-pointed; if it does not, it is the whole world and there is only one of
              it. Pick any module to swap the large tile to it and read what it emits, what it
              accepts, and which other module people confuse it with.
            </>
          }
          config={{ fixtures: TOUR_FIXTURES, preloaded: rack, workspaces: false }}
          modules={MODULES}
          rackTarget={rackTarget}
          cheat={{
            title: "Modules",
            rows: [
              ["doc-bound", "chart · table · pipeline · encoding"],
              [
                "singletons",
                "sources · charts · snapshots · compare · watchlist · inspector · trace",
              ],
              ["emits", "which presentation types are born in this tile"],
              ["accepts", "which types its commands will pause and ask you for"],
              [
                "the pairs",
                "pipeline≠table · charts≠snapshots · watchlist≠inspector · trace≠pipeline",
              ],
            ],
          }}
        />

        <TourSection
          id="brief"
          tag="✦"
          title="The brief"
          blurb={
            <>
              No lesson rail this time, and no <strong>▶ do it for me</strong>. A question, a
              workbench, and five things that have to be true when you are finished. They tick by
              watching the world, not by watching you — so any route that reaches the same state
              counts, including one nobody wrote down. <em>I&apos;m stuck</em> gives you one hint at
              a time and never the answer.
            </>
          }
          config={{ fixtures: TOUR_FIXTURES, preloaded: briefSeed() }}
          tall
          brief={{ question: briefQuestion, goals: briefGoals, hints: briefHints }}
        />

        <section className={styles.closing}>
          <div className={styles.eyebrow}>where this comes from</div>
          <Text size="base" prose>
            The interaction model is from the Lisp machines — Symbolics <strong>Genera</strong>
            &apos;s Dynamic Windows and its standardised descendant <strong>CLIM</strong>. Their
            claim was that programs should never print dead text: they <em>present</em> objects with
            the type attached, so anything ever displayed stays a handle on the real value, with a
            menu of type-appropriate verbs and the ability to be handed to a command waiting in a
            different window. The domain model is Wilkinson&apos;s <em>Grammar of Graphics</em> by
            way of <strong>ggplot2</strong> and the tidyverse: the pipeline is dplyr, the encoding
            is <em>aes()</em>, the geometry chips are geom_*, the facet channel is facet_wrap.
            Because the specification is data, freezing it and comparing two of them are trivial
            operations rather than features.
          </Text>
          <Text size="base" prose>
            The two sources are committed fixtures, served from memory rather than from a server, so
            every panel on this page starts identically on every load — and ↺ reset really does put
            one back.
          </Text>

          <div className={styles.closingNav}>
            {NAV.map((entry) => (
              <Button
                key={entry.id}
                variant="framed"
                className={styles.navItem}
                onClick={() => go(entry.id)}
              >
                ▸ §{entry.tag} {entry.label}
              </Button>
            ))}
          </div>

          <div className={styles.colophon}>
            <Text size="tiny" tone="faint">
              hover documents · L is the default verb · R is every verb · Esc aborts an accept
            </Text>
            <span className={styles.spacer} />
            <Text size="tiny" tone="faint">
              six sandboxed worlds on this page · they share nothing
            </Text>
          </div>
        </section>
      </div>
    </div>
  );
}

/** The id of the first leaf running `app`, for the rack to re-point. */
function firstLeafOfApp(
  layout: ReturnType<typeof rackSeed>["layout"],
  app: string,
): string | undefined {
  const space = layout.spaces.find((s) => s.id === layout.currentSpaceId) ?? layout.spaces[0];
  if (!space) return undefined;
  let found: string | undefined;
  const walk = (node: typeof space.tree): void => {
    if (found) return;
    if (node.type === "leaf") {
      if (node.app === app) found = node.id;
    } else {
      walk(node.a);
      walk(node.b);
    }
  };
  walk(space.tree);
  return found;
}
