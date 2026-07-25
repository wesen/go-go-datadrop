import type { PresentationDescriptor } from "../registry";
import type { MemberRef } from "../types";
import type { Action } from "../verbs";

const ROLES = ["reader", "writer", "admin"] as const;

/** `<member>` — one row of a drop's access list. */
export const memberDescriptor: PresentationDescriptor<MemberRef> = {
  ptype: "member",
  tone: "var(--pbui-tone-source)",

  label: (member) => `${member.user.name} — ${member.role} on ${member.drop}`,

  describe: (member) => ({
    presentationType: "member",
    drop: member.drop,
    user: member.user,
    role: member.role,
    isOwner: member.isOwner,
    can:
      member.role === "reader"
        ? "read events, tables, datasets and exports"
        : member.role === "writer"
          ? "everything a reader can, plus append events and publish datasets"
          : "everything a writer can, plus manage members and delete versions",
  }),

  actions: (member): Action[] => {
    // The owner is an implicit admin and cannot be demoted out of their own
    // drop. Shown greyed rather than hidden, so the rule is visible.
    const ownerReason = member.isOwner ? "the owner's role cannot be changed" : undefined;

    return [
      ...ROLES.filter((role) => role !== member.role).map((role) => ({
        label: `Set role → ${role}`,
        verb: {
          kind: "setMemberRole" as const,
          drop: member.drop,
          userId: member.user.id,
          role,
        },
        disabledBecause: ownerReason,
      })),
      {
        label: "Remove from this drop",
        verb: { kind: "removeMember", drop: member.drop, userId: member.user.id },
        disabledBecause: ownerReason ?? undefined,
      },
      { label: "Inspect", verb: { kind: "inspect", ptype: "member", value: member } },
    ];
  },
};
