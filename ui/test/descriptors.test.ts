import { describe, expect, test } from "bun:test";
import { census, readings } from "../src/fixtures";
import { actionsFor, describeFor, labelFor } from "../src/pbui/registry";
import type { PbuiEnvironment } from "../src/pbui/types";
import type { FieldType, Table } from "../src/model/table";

/**
 * The descriptors, tested with no store, no Provider and no DOM.
 *
 * This is the payoff of `actions(value, env)` returning serialisable verbs
 * rather than closures over a dispatch (see pbui/verbs.ts). A closure can only
 * be tested by running it and watching a mock; a verb can be asserted directly,
 * which means the *targeting* rules — the ones that are easy to get wrong and
 * invisible when wrong — are checkable.
 */

function env(overrides: Partial<PbuiEnvironment> = {}): PbuiEnvironment {
  const tables: Record<string, Table> = { d1: readings, d2: census };
  return {
    // Both lookups over one table, so a fixture cannot describe a field the
    // menu path would not find (DR-40).
    fieldsFor: (docId) => (docId === null ? readings : (tables[docId] ?? null))?.fields ?? [],
    tableFor: (docId) => (docId === null ? readings : (tables[docId] ?? null)),
    activeDocId: "d1",
    nameOf: (docId) => (docId === "d2" ? "β" : "α"),
    overridesFor: () => undefined,
    ...overrides,
  };
}

const verbOf = (label: string, actions: ReturnType<typeof actionsFor>) =>
  actions.find((a) => a.label.startsWith(label));

describe("<field> verbs target the owning document, not the active one", () => {
  test("a field owned by β acts on β while α is active", () => {
    // The rule the whole `{docId, name}` value shape exists for. Clicking a
    // chip inside a tile showing β must change β; the prototype gets this right
    // for marks and wrong for fields (pbui-gog.jsx:2599).
    const actions = actionsFor("field", { docId: "d2", name: "population" }, env());
    const map = verbOf("Map to y", actions);
    expect(map?.verb).toEqual({
      kind: "setMapping",
      docId: "d2",
      channel: "y",
      field: "population",
    });
  });

  test("an ownerless field falls back to the active document", () => {
    // A chip in the source browser genuinely has no owner, and the menu header
    // names where the verb will land.
    const actions = actionsFor("field", { docId: null, name: "data.temp_c" }, env());
    expect(verbOf("Map to y", actions)?.verb).toMatchObject({ docId: "d1" });
  });
});

describe("<field> offers impossible mappings, disabled, with the reason", () => {
  test("y refuses a nominal column but still lists it", () => {
    const actions = actionsFor("field", { docId: null, name: "data.station" }, env());
    const y = verbOf("Map to y", actions);
    // Present, so the user learns the rule...
    expect(y).toBeDefined();
    // ...and disabled, so they cannot produce a chart that refuses to draw.
    expect(y?.disabledBecause).toContain("quantitative");
  });

  test("x accepts every type", () => {
    for (const name of ["data.station", "data.temp_c", "time"]) {
      const actions = actionsFor("field", { docId: null, name }, env());
      expect(verbOf("Map to x", actions)?.disabledBecause).toBeUndefined();
    }
  });

  test("a field the pipeline no longer produces disables every channel", () => {
    const actions = actionsFor("field", { docId: null, name: "mean_gone" }, env());
    expect(verbOf("Map to x", actions)?.disabledBecause).toBe("not in the pipeline output");
  });
});

describe("<field> honours a per-chart type override", () => {
  const overridden = env({ overridesFor: () => ({ "data.temp_c": "n" as FieldType }) });

  test("an overridden column is offered where its NEW type is accepted", () => {
    // data.temp_c is quantitative on the server; read as nominal it becomes
    // facet-able and stops being y-able.
    const actions = actionsFor("field", { docId: null, name: "data.temp_c" }, overridden);
    expect(verbOf("Map to facet", actions)?.disabledBecause).toBeUndefined();
    expect(verbOf("Map to y", actions)?.disabledBecause).toContain("quantitative");
  });

  test("the override is offered as reversible, naming the server's answer", () => {
    const actions = actionsFor("field", { docId: null, name: "data.temp_c" }, overridden);
    const restore = verbOf("Restore the server's type", actions);
    expect(restore?.label).toContain("quantitative");
    expect(restore?.verb).toEqual({
      kind: "setTypeOverride",
      docId: "d1",
      field: "data.temp_c",
      type: null,
    });
  });
});

describe("<field> inspection is honest about its window", () => {
  test("statistics over a complete table say so", () => {
    const description = describeFor("field", { docId: null, name: "data.temp_c" }, env()) as Record<
      string,
      unknown
    >;
    expect(description.computed_over).toBe("all 360 rows");
    expect(description.mean).toBeGreaterThan(0);
  });

  test("statistics over a truncated table report a lower bound of N+1", () => {
    const truncated: Table = { ...readings, truncated: true };
    const description = describeFor(
      "field",
      { docId: null, name: "data.temp_c" },
      env({ tableFor: () => truncated }),
    ) as Record<string, unknown>;
    // Not "360 of at least 360", which is what TruncationBanner.tsx rendered.
    expect(description.computed_over).toContain("360 of at least 361");
  });

  test("provenance is reported, not just the type", () => {
    const schemaTyped = describeFor("field", { docId: "d2", name: "station_id" }, env()) as Record<
      string,
      unknown
    >;
    expect(schemaTyped.type).toBe("nominal");
    expect(schemaTyped.type_source).toBe("from the dataset schema");
  });
});

describe("<source> and <doc>", () => {
  test("a source's default verb loads it into the active document", () => {
    const actions = actionsFor("source", census.source, env());
    expect(actions[0]?.label).toContain("chart α");
    expect(actions[0]?.verb).toMatchObject({ kind: "setSource", docId: "d1" });
  });

  test("a source offers the row budget, because that is where the advice is read", () => {
    const actions = actionsFor("source", census.source, env());
    const budgets = actions.filter((a) => a.verb.kind === "setLimit");
    expect(budgets.map((a) => (a.verb as { limit: number }).limit)).toEqual([
      500, 2000, 10000, 50000,
    ]);
  });

  test("the active document is not offered 'make active'", () => {
    expect(actionsFor("doc", "d1", env()).map((a) => a.label)).not.toContain(
      "Make the ACTIVE chart",
    );
    expect(actionsFor("doc", "d2", env()).map((a) => a.label)).toContain("Make the ACTIVE chart");
  });

  test("labels resolve through the environment", () => {
    expect(labelFor("doc", "d2", env())).toBe("β");
    expect(labelFor("field", { docId: null, name: "data.temp_c" }, env())).toBe("data.temp_c");
  });
});

describe("an unknown presentation type degrades rather than throws", () => {
  test("no descriptor means no verbs, not a crash", () => {
    expect(actionsFor("tile", "n7", env())).toEqual([]);
    expect(labelFor("tile", "n7", env())).toBe("n7");
  });
});

/* ------------------------------------------------------- accounts (DR-5) -- */

describe("the account descriptors", () => {
  const token = {
    id: "7f3k9m2qx4vb3",
    name: "ci ingest",
    scopes: ["drops:write"],
    expiresAt: null,
    revokedAt: null,
  };

  test("a token's menu offers revocation, and explains when it cannot", () => {
    const live = actionsFor("token", token, env());
    expect(live[0]?.verb).toEqual({ kind: "revokeToken", tokenId: token.id });
    expect(live[0]?.disabledBecause).toBeUndefined();

    const revoked = actionsFor("token", { ...token, revokedAt: "2026-07-25T00:00:00Z" }, env());
    // Greyed with a reason rather than hidden: a user who never sees the entry
    // never learns the token is already dead.
    expect(revoked[0]?.disabledBecause).toBe("this token is already revoked");
  });

  test("nothing a token presentation exposes can carry a secret", () => {
    // DR-28. `describe` feeds the inspector, which is precisely the surface
    // that would leak one. TokenRef has no field for a secret, so this asserts
    // the property holds through the descriptor as well as through the type.
    const described = JSON.stringify(describeFor("token", token, env()));
    expect(described).not.toContain("ddp_");
    expect(described).toContain(token.id);

    for (const action of actionsFor("token", token, env())) {
      expect(JSON.stringify(action.verb)).not.toContain("ddp_");
    }
  });

  test("the owner's member row cannot be changed or removed", () => {
    const owner = {
      drop: "lab",
      user: { id: "usr_a", name: "Ada", email: "ada@example.org" },
      role: "admin" as const,
      isOwner: true,
    };
    for (const action of actionsFor("member", owner, env())) {
      if (action.verb.kind === "setMemberRole" || action.verb.kind === "removeMember") {
        expect(action.disabledBecause).toBe("the owner's role cannot be changed");
      }
    }

    const member = { ...owner, isOwner: false, role: "reader" as const };
    const roles = actionsFor("member", member, env())
      .filter((action) => action.verb.kind === "setMemberRole")
      .map((action) => (action.verb as { role: string }).role);
    // Every role except the one they already hold.
    expect(roles).toEqual(["writer", "admin"]);
  });

  test("an upload that has not been hashed says why, rather than looking broken", () => {
    const described = describeFor(
      "upload",
      {
        batchId: "b1",
        path: "data/readings.csv",
        size: 900_000_000,
        digest: null,
        state: "sending",
        error: null,
      },
      env(),
    ) as { digest: string };
    expect(described.digest).toContain("the server will hash");
  });
});
