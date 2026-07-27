import type { Channel, Geom } from "../model/chart";
import type { Aggregate, FilterOp } from "../model/pipeline";
import type { FieldType, SourceRef } from "../model/table";
import type { DocId, PresentationType } from "./types";

/**
 * What a menu entry *does*, as data rather than as a closure.
 *
 * The guide had descriptors return closures over `dispatch`. This is better in
 * two ways that matter.
 *
 * First, `actions(value, env)` becomes a pure function returning serialisable
 * values, so a test can assert the exact verb a menu entry produces — that
 * right-clicking a mark in a tile showing document β yields
 * `{kind: "addStep", docId: "β", …}` — with no store, no Provider and no DOM.
 * A closure can only be tested by running it and observing a mock.
 *
 * Second, it is the seam between the phases. Phase 1 has no world slice, so the
 * shell renders verbs and reports them; phase 2 maps the same verbs onto
 * reducers. Neither phase changes a descriptor.
 *
 * Every verb carries the document it targets. A `null` docId means "the active
 * document", resolved at the point of application rather than at menu build
 * time — the active document can change while a menu is open.
 */
export type Verb =
  /** Show an object in the inspector. */
  | { kind: "inspect"; ptype: PresentationType; value: unknown }
  /** Pin an object to the watchlist. */
  | { kind: "watch"; ptype: PresentationType; value: unknown }
  /** Map a field onto a visual channel. */
  | { kind: "setMapping"; docId: DocId | null; channel: Channel; field: string | null }
  | { kind: "setGeom"; docId: DocId | null; geom: Geom }
  | { kind: "setYScale"; docId: DocId | null; scale: "linear" | "log" }
  /** Read a column as another type, in this chart only. Never written back. */
  | { kind: "setTypeOverride"; docId: DocId | null; field: string; type: FieldType | null }
  | { kind: "addFilter"; docId: DocId | null; field: string; op: FilterOp; value: string }
  | { kind: "addSummarize"; docId: DocId | null; by: string; fn: Aggregate; field: string }
  | { kind: "addSort"; docId: DocId | null; field: string; dir: "asc" | "desc" }
  | { kind: "toggleStep"; docId: DocId | null; stepId: string }
  | { kind: "moveStep"; docId: DocId | null; stepId: string; by: -1 | 1 }
  | { kind: "removeStep"; docId: DocId | null; stepId: string }
  /** Point a document at a source, or change how much of it is loaded. */
  | { kind: "setSource"; docId: DocId | null; source: SourceRef }
  | { kind: "setLimit"; docId: DocId | null; limit: number }
  | { kind: "newDoc"; source: SourceRef | null }
  | { kind: "setActiveDoc"; docId: DocId }
  | { kind: "duplicateDoc"; docId: DocId }
  | { kind: "deleteDoc"; docId: DocId }
  | { kind: "snapshot"; docId: DocId }
  | { kind: "restoreSnapshot"; snapshotId: string; docId: DocId | null }
  | { kind: "restoreAsNewDoc"; snapshotId: string }
  | { kind: "pinSnapshot"; slot: 0 | 1; snapshotId: string }
  | { kind: "deleteSnapshot"; snapshotId: string }
  // ── accounts (DATADROP-5) ──────────────────────────────────────────────────
  //
  // Still plain serialisable data. `createToken` carries a name and scopes; the
  // SECRET is in the HTTP response and in one component's state, and appears in
  // no verb, no presentation value and no trace entry (DR-28).
  | { kind: "signIn"; intent: "signin" | "signup" }
  | { kind: "signOut"; global: boolean }
  | { kind: "createToken"; name: string; scopes: string[]; expiresIn: string | null }
  | { kind: "revokeToken"; tokenId: string }
  | { kind: "setMemberRole"; drop: string; userId: string; role: "reader" | "writer" | "admin" }
  | { kind: "removeMember"; drop: string; userId: string }
  | { kind: "claimDrop"; drop: string }
  | { kind: "retryUpload"; batchId: string; path: string }
  | { kind: "cancelUpload"; batchId: string }
  // ── the layout (DATADROP-8) ───────────────────────────────────────────────
  //
  // Every action this ticket adds is a verb of `tile`, `workspace` or `stage`.
  // The interface for all of them already existed — those three were declared
  // presentation types, were already wrapped in real <Presentation> elements,
  // and had no descriptor, so right-clicking one said "no verbs for this object
  // yet". What was missing was three files and these cases.
  //
  // Still plain serialisable data, including the ones that end in a promise:
  // `exportTile` names the tile, and the clipboard it will be written to
  // arrives on the store's thunk extra argument rather than in the verb.
  /** Open the inline editor. The COMMIT is `renameTile` below. */
  | { kind: "beginRenameTile"; nodeId: string }
  | { kind: "renameTile"; nodeId: string; label: string }
  | { kind: "duplicateTile"; nodeId: string }
  | { kind: "splitTile"; nodeId: string; dir: "row" | "col" }
  | { kind: "closeTile"; nodeId: string }
  | { kind: "exportTile"; nodeId: string }
  | { kind: "importIntoTile"; nodeId: string }
  | { kind: "beginRenameWorkspace"; spaceId: string }
  | { kind: "renameWorkspace"; spaceId: string; name: string }
  | { kind: "duplicateWorkspace"; spaceId: string }
  | { kind: "deleteWorkspace"; spaceId: string }
  | { kind: "exportWorkspace"; spaceId: string }
  | { kind: "importWorkspace"; stageId: string }
  | { kind: "switchStage"; stageId: string }
  | { kind: "exportStage"; stageId: string }
  | { kind: "importStage" }
  | { kind: "storeTemplate"; source: BundleSource; name: string };

/** What a "save this as a template" verb points at. */
export type BundleSource =
  | { kind: "tile"; nodeId: string }
  | { kind: "workspace"; spaceId: string }
  | { kind: "stage"; stageId: string };

/**
 * Where an import will land.
 *
 * A tile import replaces one leaf; a workspace import adds to a stage; a stage
 * import adds a stage. The three are different enough that one shape with
 * optional fields would need every consumer to check which fields are set.
 */
export type ImportTarget =
  | { kind: "tile"; nodeId: string }
  | { kind: "workspace"; stageId: string }
  | { kind: "stage" };

/** One entry in an object menu. */
export interface Action {
  label: string;
  verb: Verb;
  /**
   * Shown greyed with this reason rather than hidden.
   *
   * Hiding an unavailable verb hides the rule that makes it unavailable: a user
   * who never sees "Map to y" on a nominal column never learns that y requires
   * a quantitative one.
   */
  disabledBecause?: string;
}

/** A short human description of a verb, for the trace and for tests. */
export function describeVerb(verb: Verb): string {
  switch (verb.kind) {
    case "setMapping":
      return `${verb.channel} ↦ ${verb.field ?? "(none)"}`;
    case "addFilter":
      return `filter ${verb.field} ${verb.op} ${verb.value || "…"}`;
    case "addSummarize":
      return `group ${verb.by} → ${verb.fn}(${verb.field})`;
    case "addSort":
      return `sort ${verb.field} ${verb.dir}`;
    case "setTypeOverride":
      return verb.type ? `read ${verb.field} as ${verb.type}` : `clear override on ${verb.field}`;
    case "setGeom":
      return `geom ${verb.geom}`;
    case "setYScale":
      return `y scale ${verb.scale}`;
    case "signIn":
      return verb.intent === "signup" ? "create an account" : "sign in";
    case "signOut":
      return verb.global ? "sign out everywhere" : "sign out";
    case "createToken":
      // The name and the scopes, never the secret — this string reaches the
      // trace, which is a teaching surface people screenshot.
      return `mint token "${verb.name}" (${verb.scopes.join(", ")})`;
    case "revokeToken":
      return `revoke token ${verb.tokenId}`;
    case "setMemberRole":
      return `${verb.userId} → ${verb.role} on ${verb.drop}`;
    case "removeMember":
      return `remove ${verb.userId} from ${verb.drop}`;
    case "claimDrop":
      return `claim ${verb.drop}`;
    case "retryUpload":
      return `retry ${verb.path}`;
    case "cancelUpload":
      return "cancel the upload";
    // The layout verbs read as prose in the trace, which is a teaching surface
    // people screenshot — so they name the object rather than its id where the
    // verb has a name to hand.
    case "beginRenameTile":
      return "rename the tile";
    case "renameTile":
      return verb.label ? `rename tile to “${verb.label}”` : "clear the tile's name";
    case "duplicateTile":
      return "duplicate the tile";
    case "splitTile":
      return verb.dir === "row" ? "split right" : "split below";
    case "closeTile":
      return "close the tile";
    case "exportTile":
      return "copy the tile to the clipboard";
    case "importIntoTile":
      return "replace the tile from a bundle";
    case "beginRenameWorkspace":
      return "rename the workspace";
    case "renameWorkspace":
      return `rename workspace to “${verb.name}”`;
    case "duplicateWorkspace":
      return "duplicate the workspace";
    case "deleteWorkspace":
      return "delete the workspace";
    case "exportWorkspace":
      return "copy the workspace to the clipboard";
    case "importWorkspace":
      return "add a workspace from a bundle";
    case "switchStage":
      return "switch stage";
    case "exportStage":
      return "copy the stage to the clipboard";
    case "importStage":
      return "add a stage from a bundle";
    case "storeTemplate":
      return `save “${verb.name}” as a template`;
    default:
      return verb.kind;
  }
}
