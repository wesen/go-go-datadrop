import { createSlice, current, isDraft, type PayloadAction } from "@reduxjs/toolkit";
import type { ChartSpec, Channel, Geom } from "../model/chart";
import type { Step } from "../model/pipeline";
import { newStep } from "../model/pipeline";
import type { FieldType, SourceRef } from "../model/table";
import type { DocId, PresentationType } from "../pbui/types";

/**
 * The world: documents, snapshots, and the trace.
 *
 * Redux with immutable updates rather than the prototype's mutate-and-notify
 * (pbui-gog.jsx:709, :2459-2464), for three reasons in order of weight (DR-7):
 *
 *  - Fifteen tiles over 50 000 rows cannot afford a whole-tree re-render per
 *    keystroke. Selector subscriptions confine an update to the tiles that care.
 *  - In-place mutation defeats useMemo outright: `steps` keeps its identity
 *    through an edit, so a memo keyed on it never invalidates. That is worse
 *    than having no memo, because it is wrong rather than merely slow.
 *  - Serialisable state makes persistence, permalinks and snapshot equality fall
 *    out instead of needing three encoders.
 */

/** A document is an identity plus a ChartSpec (DR-8). No parallel type. */
export interface Doc {
  id: DocId;
  name: string;
  /** How much of the source is loaded. Not part of the spec: it describes the
   * window, not the drawing. Travels with a snapshot so a restore reproduces it. */
  limit: number;
  spec: ChartSpec;
}

export interface Snapshot {
  id: string;
  name: string;
  at: string;
  limit: number;
  spec: ChartSpec;
}

export interface WatchEntry {
  id: string;
  ptype: PresentationType;
  value: unknown;
}

export interface TraceEntry {
  seq: number;
  type: string;
  detail: string;
  note?: string;
}

export interface WorldState {
  docs: Record<DocId, Doc>;
  docOrder: DocId[];
  activeDocId: DocId | null;
  snapshots: Record<string, Snapshot>;
  snapshotOrder: string[];
  pins: [string | null, string | null];
  watch: WatchEntry[];
  trace: TraceEntry[];
  inspected: { title: string; value: unknown } | null;
}

/**
 * The trace is capped and drops from the front.
 *
 * The prototype's grows without bound (pbui-gog.jsx:710). At one entry per
 * keystroke in a step editor, a long session is a memory leak with a scrollbar.
 * It is a teaching surface, not an audit log of record.
 */
export const TRACE_CAP = 500;

const DOC_NAMES = ["α", "β", "γ", "δ", "ε", "ζ", "η", "θ", "ι", "κ", "λ", "μ"];

/**
 * UUIDs, not counters (DR-12).
 *
 * The prototype's counter-based ids collide after a reload, which it fixes by
 * walking the restored tree and bumping the counter past the highest id
 * (pbui-gog.jsx:236-238). A collision there is a duplicate React key *and* a
 * hit-test returning the wrong tile. UUIDs remove the class of bug instead of
 * the instance, and stay unique across tabs and exported layouts.
 */
export function newId(): string {
  return crypto.randomUUID();
}

export const DEFAULT_LIMIT = 2_000;

/**
 * Deep-copy a spec out of a reducer.
 *
 * `structuredClone` alone throws `DataCloneError` here: createSlice runs
 * reducers under Immer, so `doc.spec` is a Proxy over a draft rather than a
 * plain object, and a Proxy cannot be structurally cloned.
 *
 * Immer's `current()` materialises the draft into a plain value first. This is
 * worth understanding rather than pattern-matching, because the obvious
 * alternative — a spread — does NOT throw. It produces a shallow copy that
 * aliases `steps` and `mapping`, so every snapshot silently tracks the document
 * it was taken from, which is precisely the defect the snapshot tests exist to
 * catch and precisely the kind that survives review.
 */
function cloneSpec(spec: ChartSpec): ChartSpec {
  return structuredClone(isDraft(spec) ? (current(spec) as ChartSpec) : spec);
}

export function emptySpec(source: SourceRef): ChartSpec {
  return {
    source,
    steps: [],
    geom: "point",
    mapping: { x: null, y: null, color: null, size: null, facet: null },
    yScale: "linear",
  };
}

export const initialWorld: WorldState = {
  docs: {},
  docOrder: [],
  activeDocId: null,
  snapshots: {},
  snapshotOrder: [],
  pins: [null, null],
  watch: [],
  trace: [],
  inspected: null,
};

/** Append to the trace, dropping from the front at the cap. */
function trace(state: WorldState, type: string, detail: string, note?: string) {
  const seq = (state.trace[state.trace.length - 1]?.seq ?? 0) + 1;
  state.trace.push({ seq, type, detail, ...(note ? { note } : {}) });
  if (state.trace.length > TRACE_CAP) state.trace.splice(0, state.trace.length - TRACE_CAP);
}

/** Resolve a verb's target: an explicit document, or the active one. */
function target(state: WorldState, docId: DocId | null): Doc | null {
  const id = docId ?? state.activeDocId;
  return id ? (state.docs[id] ?? null) : null;
}

function nextName(state: WorldState): string {
  const used = new Set(Object.values(state.docs).map((d) => d.name));
  const free = DOC_NAMES.find((n) => !used.has(n));
  return free ?? `${DOC_NAMES[0]}${state.docOrder.length}`;
}

export const worldSlice = createSlice({
  name: "world",
  initialState: initialWorld,
  reducers: {
    newDoc: {
      reducer(
        state,
        action: PayloadAction<{ id: DocId; source: SourceRef | null; limit: number }>,
      ) {
        const { id, source, limit } = action.payload;
        const doc: Doc = {
          id,
          name: nextName(state),
          limit,
          spec: emptySpec(source ?? { kind: "stream", drop: "" }),
        };
        state.docs[id] = doc;
        state.docOrder.push(id);
        state.activeDocId = id;
        trace(state, "doc_added", doc.name);
      },
      prepare(source: SourceRef | null, limit = DEFAULT_LIMIT) {
        return { payload: { id: newId(), source, limit } };
      },
    },

    setActiveDoc(state, action: PayloadAction<DocId>) {
      const doc = state.docs[action.payload];
      if (!doc || state.activeDocId === doc.id) return;
      state.activeDocId = doc.id;
      trace(state, "doc_activated", doc.name, "ambient verbs now act on it");
    },

    renameDoc(state, action: PayloadAction<{ docId: DocId; name: string }>) {
      const doc = state.docs[action.payload.docId];
      if (!doc || !action.payload.name) return;
      doc.name = action.payload.name;
      trace(state, "doc_renamed", doc.name);
    },

    duplicateDoc(state, action: PayloadAction<{ docId: DocId; id: DocId }>) {
      const source = state.docs[action.payload.docId];
      if (!source) return;
      const doc: Doc = {
        id: action.payload.id,
        name: `${source.name}′`,
        limit: source.limit,
        // A deep copy, not a spread: a shallow copy would alias `steps` and
        // `mapping`, so editing the duplicate would edit the original.
        spec: cloneSpec(source.spec),
      };
      state.docs[doc.id] = doc;
      state.docOrder.push(doc.id);
      state.activeDocId = doc.id;
      trace(state, "doc_duplicated", `${source.name} → ${doc.name}`);
    },

    deleteDoc(state, action: PayloadAction<DocId>) {
      // Keep at least one document: every doc-bound tile would otherwise have
      // nothing to show and no way to get something.
      if (state.docOrder.length < 2) return;
      const doc = state.docs[action.payload];
      if (!doc) return;
      delete state.docs[doc.id];
      state.docOrder = state.docOrder.filter((id) => id !== doc.id);
      // Reassign rather than leaving activeDocId dangling, which would make
      // every ambient verb a silent no-op.
      if (state.activeDocId === doc.id) state.activeDocId = state.docOrder[0] ?? null;
      trace(state, "doc_removed", doc.name);
    },

    setDocSource(state, action: PayloadAction<{ docId: DocId | null; source: SourceRef }>) {
      const doc = target(state, action.payload.docId);
      if (!doc) return;
      // A new source invalidates the pipeline and the encoding: both name
      // columns that the new source may not have. Resetting is honest; keeping
      // them would produce a chart that refuses to draw with no obvious cause.
      doc.spec = emptySpec(action.payload.source);
      trace(state, "source_set", action.payload.source.drop, "pipeline and encoding reset");
    },

    setDocLimit(state, action: PayloadAction<{ docId: DocId | null; limit: number }>) {
      const doc = target(state, action.payload.docId);
      if (!doc) return;
      doc.limit = action.payload.limit;
      trace(state, "limit_set", `${action.payload.limit} rows`);
    },

    setSpec(state, action: PayloadAction<{ docId: DocId | null; spec: ChartSpec }>) {
      const doc = target(state, action.payload.docId);
      if (!doc) return;
      doc.spec = action.payload.spec;
    },

    setMapping(
      state,
      action: PayloadAction<{ docId: DocId | null; channel: Channel; field: string | null }>,
    ) {
      const doc = target(state, action.payload.docId);
      if (!doc) return;
      doc.spec.mapping[action.payload.channel] = action.payload.field;
      trace(state, "encoded", `${action.payload.channel} ↦ ${action.payload.field ?? "(none)"}`);
    },

    setGeom(state, action: PayloadAction<{ docId: DocId | null; geom: Geom }>) {
      const doc = target(state, action.payload.docId);
      if (!doc) return;
      doc.spec.geom = action.payload.geom;
      trace(state, "geom_set", action.payload.geom);
    },

    setYScale(state, action: PayloadAction<{ docId: DocId | null; scale: "linear" | "log" }>) {
      const doc = target(state, action.payload.docId);
      if (!doc) return;
      doc.spec.yScale = action.payload.scale;
      trace(state, "scale_set", `y ${action.payload.scale}`);
    },

    setTypeOverride(
      state,
      action: PayloadAction<{ docId: DocId | null; field: string; type: FieldType | null }>,
    ) {
      const doc = target(state, action.payload.docId);
      if (!doc) return;
      const overrides = { ...(doc.spec.typeOverrides ?? {}) };
      if (action.payload.type === null) delete overrides[action.payload.field];
      else overrides[action.payload.field] = action.payload.type;
      // Undefined rather than an empty object, so a spec with no overrides
      // serialises identically however it got there — which matters because
      // permalinks and snapshot equality compare the serialised form.
      doc.spec.typeOverrides = Object.keys(overrides).length > 0 ? overrides : undefined;
      trace(state, "type_override", `${action.payload.field} → ${action.payload.type ?? "server"}`);
    },

    addStep(state, action: PayloadAction<{ docId: DocId | null; step: Step }>) {
      const doc = target(state, action.payload.docId);
      if (!doc) return;
      doc.spec.steps.push(action.payload.step);
      trace(state, "step_added", action.payload.step.kind);
    },

    updateStep(state, action: PayloadAction<{ docId: DocId | null; step: Step }>) {
      const doc = target(state, action.payload.docId);
      if (!doc) return;
      const index = doc.spec.steps.findIndex((s) => s.id === action.payload.step.id);
      if (index >= 0) doc.spec.steps[index] = action.payload.step;
    },

    toggleStep(state, action: PayloadAction<{ docId: DocId | null; stepId: string }>) {
      const doc = target(state, action.payload.docId);
      const step = doc?.spec.steps.find((s) => s.id === action.payload.stepId);
      if (!step) return;
      // Disable without deleting: this is what makes a pipeline an experiment
      // rather than a recording. You A/B your own transform by toggling it.
      step.on = !step.on;
      trace(state, "step_toggled", `${step.kind} ${step.on ? "on" : "off"}`);
    },

    moveStep(state, action: PayloadAction<{ docId: DocId | null; stepId: string; by: -1 | 1 }>) {
      const doc = target(state, action.payload.docId);
      if (!doc) return;
      const from = doc.spec.steps.findIndex((s) => s.id === action.payload.stepId);
      const to = from + action.payload.by;
      if (from < 0 || to < 0 || to >= doc.spec.steps.length) return;
      const steps = doc.spec.steps;
      [steps[from], steps[to]] = [steps[to] as Step, steps[from] as Step];
      trace(state, "step_moved", action.payload.by < 0 ? "up" : "down");
    },

    removeStep(state, action: PayloadAction<{ docId: DocId | null; stepId: string }>) {
      const doc = target(state, action.payload.docId);
      if (!doc) return;
      doc.spec.steps = doc.spec.steps.filter((s) => s.id !== action.payload.stepId);
      trace(state, "step_removed", action.payload.stepId);
    },

    snapshot: {
      reducer(state, action: PayloadAction<{ id: string; docId: DocId; at: string }>) {
        const doc = state.docs[action.payload.docId];
        if (!doc) return;
        const snapshot: Snapshot = {
          id: action.payload.id,
          name: `${doc.name}-${state.snapshotOrder.length + 1}`,
          at: action.payload.at,
          limit: doc.limit,
          // A deep copy, so later mutation of the document does not move the
          // snapshot. This is the one line the whole feature depends on.
          spec: cloneSpec(doc.spec),
        };
        state.snapshots[snapshot.id] = snapshot;
        state.snapshotOrder.push(snapshot.id);
        trace(state, "snapshotted", snapshot.name);
      },
      prepare(docId: DocId, at: string) {
        return { payload: { id: newId(), docId, at } };
      },
    },

    restoreSnapshot(state, action: PayloadAction<{ snapshotId: string; docId: DocId | null }>) {
      const snapshot = state.snapshots[action.payload.snapshotId];
      const doc = target(state, action.payload.docId);
      if (!snapshot || !doc) return;
      doc.spec = cloneSpec(snapshot.spec);
      doc.limit = snapshot.limit;
      trace(state, "restored", `${snapshot.name} → ${doc.name}`);
    },

    deleteSnapshot(state, action: PayloadAction<string>) {
      delete state.snapshots[action.payload];
      state.snapshotOrder = state.snapshotOrder.filter((id) => id !== action.payload);
      state.pins = state.pins.map((p) => (p === action.payload ? null : p)) as [
        string | null,
        string | null,
      ];
      trace(state, "snapshot_deleted", action.payload);
    },

    pinSnapshot(state, action: PayloadAction<{ slot: 0 | 1; snapshotId: string }>) {
      state.pins[action.payload.slot] = action.payload.snapshotId;
      trace(state, "pinned", action.payload.slot === 0 ? "A" : "B");
    },

    watchAdd: {
      reducer(state, action: PayloadAction<WatchEntry>) {
        state.watch.push(action.payload);
        trace(state, "watched", action.payload.ptype);
      },
      prepare(ptype: PresentationType, value: unknown) {
        return { payload: { id: newId(), ptype, value } };
      },
    },

    watchRemove(state, action: PayloadAction<string>) {
      state.watch = state.watch.filter((w) => w.id !== action.payload);
    },

    inspect(state, action: PayloadAction<{ title: string; value: unknown }>) {
      state.inspected = action.payload;
      trace(state, "inspected", action.payload.title);
    },
  },
});

export const worldActions = worldSlice.actions;

/** Mint a step of the given kind. Separate so the caller supplies the schema. */
export { newStep };
