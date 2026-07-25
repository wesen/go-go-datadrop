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
import { Text } from "../../components/foundation";
import { Stack, Toolbar } from "../../components/layout";
import { Chip } from "../../components/atoms";

const ROLES = ["reader", "writer", "admin"] as const;

/**
 * Who else can see a drop, and — for an admin — who else may.
 *
 * Lives beside the application that uses it rather than in components/, and
 * that placement was decided by the layer test rather than by taste: this
 * fetches and mutates, and `molecules` may not import `api`. `organisms` may —
 * but `apps` may not import `organisms`, because that edge is what keeps the
 * organisms/apps pair acyclic. Co-locating is the honest answer for a component
 * one application uses.
 *
 * Reading the list needs only `reader`: knowing who else can see something you
 * can see is not a privilege, and hiding it makes "why can they read this"
 * unanswerable without finding an administrator.
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

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("reader");
  const [error, setError] = useState<string | null>(null);

  const admin = yourRole === "admin";

  async function add() {
    setError(null);
    try {
      // Two steps, because a human knows an address and the API needs an id.
      // The lookup is an existence oracle over email addresses, which is why
      // the server restricts it to people who already administer something.
      const user = await lookupUser(email).unwrap();
      await setMember({ drop, userId: user.id, role }).unwrap();
      setEmail("");
    } catch (caught) {
      const detail = (caught as { data?: { detail?: string }; status?: number })?.data?.detail;
      setError(detail ?? "no datadrop account has that address yet");
    }
  }

  return (
    <Stack gap={2}>
      {unowned && (
        <Toolbar tight>
          <Text size="tiny" tone="faint">
            this drop has no owner
          </Text>
          <button type="button" onClick={() => void claimDrop(drop)}>
            <Text size="tiny">claim it</Text>
          </button>
        </Toolbar>
      )}

      {data?.members.map((member) => {
        const value: MemberRef = {
          drop,
          user: {
            id: member.user_id,
            name: member.user?.name || member.user?.email || member.user_id,
            email: member.user?.email ?? null,
          },
          role: member.role,
          isOwner: member.user_id === data.owner,
        };
        return (
          <Toolbar key={member.user_id} tight>
            <Presentation ptype="member" value={value} doc={`<member> ${value.user.name} — ${member.role}`}>
              <Chip label={value.user.name} tone="var(--pbui-tone-source)" badge={
                <span style={{ fontSize: "var(--pbui-fs-tiny)", opacity: 0.7 }}>{member.role}</span>
              } />
            </Presentation>
            {admin && (
              <>
                <select
                  aria-label={`role of ${value.user.name}`}
                  value={member.role}
                  onChange={(event) =>
                    void setMember({
                      drop,
                      userId: member.user_id,
                      role: event.target.value as (typeof ROLES)[number],
                    })
                  }
                  style={{ font: "inherit", fontSize: "var(--pbui-fs-tiny)" }}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void removeMember({ drop, userId: member.user_id })}
                >
                  <Text size="tiny">remove</Text>
                </button>
              </>
            )}
          </Toolbar>
        );
      })}

      {admin ? (
        <Stack gap={1}>
          <Toolbar tight>
            <input
              aria-label={`add a member to ${drop}`}
              placeholder="colleague@example.org"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              style={{ font: "inherit", padding: "2px 4px", border: "var(--pbui-border-hair)" }}
            />
            <select
              aria-label="role for the new member"
              value={role}
              onChange={(event) => setRole(event.target.value as (typeof ROLES)[number])}
              style={{ font: "inherit", fontSize: "var(--pbui-fs-tiny)" }}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <button type="button" disabled={!email.trim()} onClick={() => void add()}>
              <Text size="tiny">add</Text>
            </button>
          </Toolbar>
          {error && (
            <Text size="tiny" tone="danger">
              {error}
            </Text>
          )}
          <Text size="tiny" tone="faint" prose>
            They must have signed in here at least once. Removing someone takes
            effect immediately, including for every API token they hold.
          </Text>
        </Stack>
      ) : (
        // Shown rather than hidden, so the rule is visible: a writer who cannot
        // find the member editor should learn why, not conclude it is missing.
        data?.members.length !== undefined && (
          <Text size="tiny" tone="faint">
            only an admin of this drop can change who has access
          </Text>
        )
      )}
    </Stack>
  );
}
