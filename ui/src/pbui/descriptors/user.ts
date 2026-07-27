import type { PresentationDescriptor } from "../registry";
import type { UserRef } from "../types";
import type { Action } from "../verbs";

/** `<user>` — a person: the signed-in user, or a member of a drop. */
export const userDescriptor: PresentationDescriptor<UserRef> = {
  ptype: "user",
  tone: "var(--pbui-tone-doc)",

  label: (user) => user.name || user.email || user.id,

  describe: (user) => ({
    presentationType: "user",
    id: user.id,
    name: user.name,
    email: user.email,
    // Says where the authority for this record actually lies, because the
    // profile tile cannot edit any of it and a user who does not know that
    // reads the tile as broken (guide §5.4).
    managedBy: "the identity provider — password, MFA and email live there",
  }),

  actions: (user): Action[] => [
    { label: "Inspect", verb: { kind: "inspect", ptype: "user", value: user } },
    { label: "Watch", verb: { kind: "watch", ptype: "user", value: user } },
  ],
};
