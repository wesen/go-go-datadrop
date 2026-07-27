import type { ReactNode } from "react";
import { Toolbar } from "../../layout";
import { Text } from "../../foundation";
import { Button, Chip, SelectInput } from "../../atoms";
import type { MemberRef } from "../../../pbui";

export const ROLES = ["reader", "writer", "admin"] as const;
export type Role = (typeof ROLES)[number];

/**
 * One person's access to one drop.
 *
 * Presentational: it takes a `MemberRef` and two callbacks and does not know
 * that changing a role is a PUT. `MemberPanel` and the application above it own
 * that.
 *
 * The owner's row cannot be edited, and the control is *shown* disabled rather
 * than hidden — a member list where the owner silently has no controls reads as
 * a rendering bug. `isOwner` is on the ref for exactly this.
 *
 * `renderChip` is the DR-38 seam: the application wraps the chip in a
 * `Presentation` so a member is right-clickable, and the default renders a
 * plain chip so the story needs no provider.
 */
export function MemberRow({
  member,
  canEdit,
  onRoleChange,
  onRemove,
  renderChip,
}: {
  member: MemberRef;
  canEdit: boolean;
  onRoleChange?(role: Role): void;
  onRemove?(): void;
  renderChip?: (member: MemberRef, body: ReactNode) => ReactNode;
}) {
  const chip = (
    <Chip
      label={member.user.name}
      tone="var(--pbui-tone-source)"
      title={member.user.email ?? member.user.id}
      badge={
        <Text size="tiny" tone="faint" as="span">
          {member.isOwner ? "owner" : member.role}
        </Text>
      }
    />
  );

  return (
    <Toolbar tight data-part="member-row">
      {renderChip ? renderChip(member, chip) : chip}
      {canEdit && (
        <>
          <SelectInput
            label={`role of ${member.user.name}`}
            size="tiny"
            value={member.role}
            disabled={member.isOwner}
            options={ROLES.map((r) => ({ value: r, label: r }))}
            onValueChange={(role) => onRoleChange?.(role as Role)}
          />
          <Button
            size="tiny"
            tone="danger"
            disabled={member.isOwner}
            title={member.isOwner ? "the owner cannot be removed" : undefined}
            onClick={() => onRemove?.()}
          >
            remove
          </Button>
        </>
      )}
    </Toolbar>
  );
}
