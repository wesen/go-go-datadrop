import type { ModuleEntry } from "../appkit/lessons";

/**
 * A reference card for every registered application.
 *
 * Every one, not the interesting ones. `test/tour.test.ts` asserts that the ids
 * here and the ids in the registry are the same set, so a new application
 * cannot ship undocumented — which is the failure this is really guarding
 * against, because an application nobody wrote a card for is an application
 * nobody has a model of.
 *
 * Five fixed rows, and **`vs` is the one that earns the format**. Four pairs get
 * confused — pipeline≠table, charts≠snapshots, watchlist≠inspector,
 * trace≠pipeline — and naming the confusion is cheaper than waiting for it. A
 * card with nothing useful in that row is itself information: it usually means
 * the application has no near neighbour, and occasionally that nobody has a
 * model of it at all.
 *
 * Ported from `pbui-landing.jsx:2322-2419`, which covers twelve. The other
 * nine — sources, spec, about, the four tutorials and the four account
 * applications — are ours and had never been described anywhere.
 */
export const MODULES: ModuleEntry[] = [
  /* ── document-bound views ──────────────────────────────────────────────── */
  {
    id: "chart",
    what: "The composed picture for one document.",
    emits: (
      <>
        <b>&lt;datum&gt;</b> for every mark, <b>&lt;cat&gt;</b> for every legend swatch,{" "}
        <b>&lt;source&gt;</b> in its header.
      </>
    ),
    accepts: "—",
    lr: "R on a mark or a swatch writes a filter step into this chart's own pipeline.",
    vs: <>a picture. It is a view, and editing it edits the document.</>,
  },
  {
    id: "table",
    what: "The pipeline's live output relation, after every enabled step.",
    emits: (
      <>
        <b>&lt;field&gt;</b> in the headers, <b>&lt;datum&gt;</b> in the row-number cells.
      </>
    ),
    accepts: "—",
    lr: "R a row № to keep or exclude its categories; R a header to map or sort by it.",
    vs: (
      <>
        the <b>pipeline</b> — that is the recipe, this is the food.
      </>
    ),
  },
  {
    id: "pipeline",
    what: "The chain of verbs that produces the data: filter, derive, group∑, sort, limit.",
    emits: (
      <>
        <b>&lt;step&gt;</b> per row, <b>&lt;field&gt;</b> in the OUT schema, <b>&lt;source&gt;</b>{" "}
        as SOURCE.
      </>
    ),
    accepts: (
      <>
        <b>&lt;field&gt;</b> — “+ filter…” and “+ group∑…” pause and wait for you to click one.
      </>
    ),
    lr: "✓ disables a step in place; R gives move ↑↓ and remove. Order is semantics.",
    vs: <>an undo history. Steps are objects you can reorder, not events that happened.</>,
  },
  {
    id: "encode",
    what: "The aesthetic mapping — which field drives which visual channel — plus geom and scale.",
    emits: (
      <>
        <b>&lt;field&gt;</b> per filled channel, <b>&lt;geom&gt;</b> per geometry chip,{" "}
        <b>&lt;channel&gt;</b> per row.
      </>
    ),
    accepts: (
      <>
        <b>&lt;field&gt;</b> — one ⌖ per channel: x, y, colour, size, facet.
      </>
    ),
    lr: "L a geom chip to use it. × clears a channel.",
    vs: <>a chart-type menu. There is no “bar chart”, only a bar geom over a mapping.</>,
  },

  /* ── world singletons ─────────────────────────────────────────────────── */
  {
    id: "sources",
    what: "Every drop, stream and dataset the server offers, and the row budget to load it at.",
    emits: (
      <>
        <b>&lt;source&gt;</b> per stream or dataset, <b>&lt;field&gt;</b> once a table is loaded.
      </>
    ),
    accepts: "—",
    lr: "L a source makes it the ACTIVE document's source. The budget selector is a real limit.",
    vs: <>a file picker. These fields are the same objects the encoding tile consumes.</>,
  },
  {
    id: "charts",
    what: "The document manager: every live chart in the world, α, β, γ…",
    emits: (
      <>
        <b>&lt;doc&gt;</b> per card.
      </>
    ),
    accepts: "—",
    lr: "L a doc chip makes it ACTIVE — the target of every ambient verb fired from anywhere.",
    vs: (
      <>
        the <b>snapshots</b> tile — these are alive and still changing.
      </>
    ),
  },
  {
    id: "gallery",
    what: "Frozen copies of a whole specification, kept as immutable objects.",
    emits: (
      <>
        <b>&lt;chart&gt;</b> per card.
      </>
    ),
    accepts: "—",
    lr: "L restores into the ACTIVE document. R restores as a NEW one, or pins it to compare A / B.",
    vs: <>a document. ⚑ copies the spec; the snapshot does not move afterwards.</>,
  },
  {
    id: "compare",
    what: "Two frozen specifications side by side, with their pipelines and encodings spelled out.",
    emits: (
      <>
        <b>&lt;chart&gt;</b> for each pinned side.
      </>
    ),
    accepts: (
      <>
        <b>&lt;chart&gt;</b> — “accept…”, then click a snapshot name anywhere.
      </>
    ),
    lr: "L a pinned name restores it into the active document.",
    vs: <>a diff tool. It shows two specifications; you do the reading.</>,
  },
  {
    id: "watch",
    what: "A scratchpad of objects you want to keep within reach, of any type at all.",
    emits: <>re-presents whatever you put in it — still live, still right-clickable.</>,
    accepts: (
      <>
        <b>any type</b> — the broadest accept in the system.
      </>
    ),
    lr: "Same verbs as wherever the object came from. × removes it from the list.",
    vs: (
      <>
        the <b>inspector</b> — that shows the last thing you looked at, this shows what you kept.
      </>
    ),
  },
  {
    id: "inspector",
    what: "The full description of the last object you inspected, printed as data.",
    emits: "—",
    accepts: "—",
    lr: "Fed by the Inspect verb, which every object type offers.",
    vs: <>a properties panel. It is a reader, not an editor.</>,
  },
  {
    id: "trace",
    what: "The session transcript: every verb, with the object and the document it acted on.",
    emits: "—",
    accepts: "—",
    lr: "Read-only. The strip at the bottom of the shell is its last few lines.",
    vs: (
      <>
        the <b>pipeline</b> — that is what the chart does, this is what you did.
      </>
    ),
  },
  {
    id: "launcher",
    what: "What an empty tile shows: one button per application.",
    emits: "—",
    accepts: "—",
    lr: "L an application to become it. The tile's own dropdown does the same thing.",
    vs: <>a home screen. A tile is never empty for long, and nothing is stored here.</>,
  },
  {
    id: "about",
    what: "Where the ideas come from — Genera and CLIM, Wilkinson and ggplot2 — and the vocabulary.",
    emits: (
      <>
        <b>&lt;field&gt;</b> in its worked example.
      </>
    ),
    accepts: "—",
    lr: "Prose. The chips in it are live, which is the point being made.",
    vs: <>documentation you have to leave the application to read.</>,
  },

  /* ── the teaching tiles (DATADROP-7) ──────────────────────────────────── */
  {
    id: "lessons",
    what: "This section's lesson rail. A step completes when the WORLD says so, not when a button was pressed.",
    emits: "—",
    accepts: (
      <>
        <b>&lt;field&gt;</b>, in the step that teaches the accept protocol.
      </>
    ),
    lr: "▶ dispatches exactly what the interface dispatches — so it ticks grey, not green.",
    vs: (
      <>
        the <b>tutorial</b> tiles, which are fixed content. A rail is the same
        application over whichever lessons its section carries.
      </>
    ),
  },
  {
    id: "cheat",
    what: "The vocabulary of this section, in one place you can find again.",
    emits: "—",
    accepts: "—",
    lr: "Read-only. Close it if you would rather have the room.",
    vs: <>the <b>about</b> tile — that explains the system, this names its terms.</>,
  },
  {
    id: "modules",
    what: "A reference card for every registered application, with a live specimen beside it.",
    emits: "—",
    accepts: "—",
    lr: "L a card to re-point a sibling tile to that application.",
    vs: <>the <b>launcher</b> — that opens one, this explains what opening it would get you.</>,
  },
  {
    id: "brief",
    what: "The capstone: a question and the things that must be true when you have answered it.",
    emits: "—",
    accepts: "—",
    lr: "No ▶. Goals tick by watching the world, so any route counts.",
    vs: (
      <>
        the <b>lessons</b> rail — that teaches a move, this asks for an outcome and
        does not say how.
      </>
    ),
  },

  /* ── the tutorials ────────────────────────────────────────────────────── */
  {
    id: "tut1",
    what: "Objects and verbs: hover, right-click, accept.",
    emits: "—",
    accepts: (
      <>
        <b>&lt;field&gt;</b>, in the step that teaches accept.
      </>
    ),
    lr: "▶ dispatches exactly what the interface dispatches, so it cannot rot.",
    vs: <>a video. Every step is executable, and a renamed action breaks the build.</>,
  },
  {
    id: "tut2",
    what: "The pipeline: five verbs, and why order is semantics.",
    emits: "—",
    accepts: "—",
    lr: "▶ per step; the tiles beside it move.",
    vs: <>the pipeline tile itself — this is about it, not it.</>,
  },
  {
    id: "tut3",
    what: "Encoding: channel ↦ field, geoms and their type requirements.",
    emits: "—",
    accepts: "—",
    lr: "▶ per step, including the deliberate mistake.",
    vs: <>a chart gallery. There are no chart types here to browse.</>,
  },
  {
    id: "tut4",
    what: "Documents, tiles and snapshots: what is a view and what is the thing.",
    emits: "—",
    accepts: "—",
    lr: "▶ per step.",
    vs: <>the charts tile — this explains the distinction that tile relies on.</>,
  },

  /* ── accounts (DATADROP-5) ────────────────────────────────────────────── */
  {
    id: "signin",
    what: "The gate: sign in, sign up, or paste a static token, depending on the server's mode.",
    emits: "—",
    accepts: "—",
    lr: "The only tile that navigates away from the application.",
    vs: (
      <>
        the <b>profile</b> tile — that is who you are, this is how you got here.
      </>
    ),
  },
  {
    id: "profile",
    what: "Who you are, which drops you can reach, and the sessions you have open.",
    emits: (
      <>
        <b>&lt;user&gt;</b>, and <b>&lt;source&gt;</b> per drop you can read.
      </>
    ),
    accepts: "—",
    lr: "L a drop to browse it. Sign out ends this session, or every session.",
    vs: (
      <>
        the <b>tokens</b> tile — a session is a browser, a token is a program.
      </>
    ),
  },
  {
    id: "tokens",
    what: "API tokens: mint, scope, expire and revoke.",
    emits: (
      <>
        <b>&lt;token&gt;</b> per row — <b>by id</b>, never carrying the secret (DR-28).
      </>
    ),
    accepts: "—",
    lr: "The secret appears exactly once, in the response to minting, and is never stored.",
    vs: (
      <>
        the <b>profile</b> tile's session list. A revoked token stays listed; a session vanishes.
      </>
    ),
  },
  {
    id: "upload",
    what: "Dataset upload: hash, mount, send, commit — resumable, and honest about which stage failed.",
    emits: (
      <>
        <b>&lt;upload&gt;</b> per queued file.
      </>
    ),
    accepts: "—",
    lr: "A draft survives a reload; the queue says which stage each file reached.",
    vs: <>a file picker. The four stages are separately observable because they fail separately.</>,
  },
];
