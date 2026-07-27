import type { ReactNode } from "react";
import { Stack, Toolbar } from "../../layout";
import { Text } from "../../foundation";
import { Button } from "../../atoms";
import { EmptyState, MemberInvite, MemberRow } from "../../molecules";
import type { Role } from "../../molecules";
import type { MemberRef } from "../../../pbui";

/**
 * Who else can see a drop, and — for an admin — who else may.
 *
 * Presentational. The application above holds the five RTK Query hooks; this
 * takes the list and five callbacks. That split is what makes the reader's view
 * and the unowned-drop case renderable without a server.
 *
 * Reading the list needs only `reader`: knowing who else can see something you
 * can see is not a privilege, and hiding it makes "why can they read this"
 * unanswerable without finding an administrator. So the non-admin branch shows
 * the list *and* says why the editor is absent, rather than rendering nothing.
 */
export function MemberPanel({
  drop,
  members,
  yourRole,
  unowned,
  error,
  onClaim,
  onAdd,
  onRoleChange,
  onRemove,
  renderChip,
}: {
  drop: string;
  members: readonly MemberRef[];
  yourRole: string;
  /** No owner — anyone who can write may claim it. */
  unowned: boolean;
  error?: string | null;
  onClaim(): void;
  onAdd(email: string, role: Role): void;
  onRoleChange(userId: string, role: Role): void;
  onRemove(userId: string): void;
  renderChip?: (member: MemberRef, body: ReactNode) => ReactNode;
}) {
  const admin = yourRole === "admin";

  return (
    <Stack gap={2} data-part="member-panel">
      {unowned && (
        <Toolbar tight>
          <Text size="tiny" tone="faint">
            this drop has no owner
          </Text>
          <Button size="tiny" onClick={onClaim}>
            claim it
          </Button>
        </Toolbar>
      )}

      {members.length === 0 ? (
        <EmptyState size="tiny" message="nobody else has access" />
      ) : (
        members.map((member) => (
          <MemberRow
            key={member.user.id}
            member={member}
            canEdit={admin}
            onRoleChange={(role) => onRoleChange(member.user.id, role)}
            onRemove={() => onRemove(member.user.id)}
            renderChip={renderChip}
          />
        ))
      )}

      {admin ? (
        <MemberInvite drop={drop} error={error} onAdd={onAdd} />
      ) : (
        // Shown rather than hidden, so the rule is visible: a writer who cannot
        // find the member editor should learn why, not conclude it is missing.
        <Text size="tiny" tone="faint">
          only an admin of this drop can change who has access
        </Text>
      )}
    </Stack>
  );
}
