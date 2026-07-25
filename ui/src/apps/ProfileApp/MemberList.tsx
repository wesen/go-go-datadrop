import { useState } from "react";
import {
  useClaimDropMutation,
  useLazyLookupUserQuery,
  useListMembersQuery,
  useRemoveMemberMutation,
  useSetMemberMutation,
} from "../../api/client";
import { Presentation } from "../../pbui";
import type { MemberRef } from "../../pbui";
import { MemberPanel } from "../../components/organisms";
import type { Role } from "../../components/molecules";

/**
 * The container half of one drop's access list.
 *
 * Five hooks and five callbacks; every pixel is `MemberPanel`. Before phase 5
 * this file was 177 lines and could not live in `components/` at all — it
 * fetches, `molecules` may not import `api`, and `apps` could not import
 * `organisms`. DR-33 removed the last of those constraints, so the split is now
 * the ordinary one: container here, presentation there.
 */
export function MemberList({
  drop,
  yourRole,
  unowned,
}: {
  drop: string;
  yourRole: string;
  unowned: boolean;
}) {
  const { data } = useListMembersQuery(drop);
  const [setMember] = useSetMemberMutation();
  const [removeMember] = useRemoveMemberMutation();
  const [claimDrop] = useClaimDropMutation();
  const [lookupUser] = useLazyLookupUserQuery();
  const [error, setError] = useState<string | null>(null);

  const members: MemberRef[] = (data?.members ?? []).map((member) => ({
    drop,
    user: {
      id: member.user_id,
      name: member.user?.name || member.user?.email || member.user_id,
      email: member.user?.email ?? null,
    },
    role: member.role,
    isOwner: member.user_id === data?.owner,
  }));

  async function add(email: string, role: Role) {
    setError(null);
    try {
      // Two steps, because a human knows an address and the API needs an id.
      // The lookup is an existence oracle over email addresses, which is why
      // the server restricts it to people who already administer something.
      const user = await lookupUser(email).unwrap();
      await setMember({ drop, userId: user.id, role }).unwrap();
    } catch (caught) {
      const detail = (caught as { data?: { detail?: string } })?.data?.detail;
      setError(detail ?? "no datadrop account has that address yet");
    }
  }

  return (
    <MemberPanel
      drop={drop}
      members={members}
      yourRole={yourRole}
      unowned={unowned}
      error={error}
      onClaim={() => void claimDrop(drop)}
      onAdd={(email, role) => void add(email, role)}
      onRoleChange={(userId, role) => void setMember({ drop, userId, role })}
      onRemove={(userId) => void removeMember({ drop, userId })}
      // The DR-38 seam: the panel draws a plain chip, and the application makes
      // it a live presentation so a member can be right-clicked.
      renderChip={(member, body) => (
        <Presentation
          ptype="member"
          value={member}
          doc={`<member> ${member.user.name} — ${member.role}`}
        >
          {body}
        </Presentation>
      )}
    />
  );
}
