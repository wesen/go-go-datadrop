import { useState } from "react";
import { Stack, Toolbar } from "../../layout";
import { Text } from "../../foundation";
import { Button, SelectInput, TextInput } from "../../atoms";
import { ErrorNotice } from "../ErrorNotice";
import { ROLES } from "../MemberRow";
import type { Role } from "../MemberRow";

/**
 * Add someone to a drop, by the thing a human knows about them.
 *
 * The address is turned into a user id by a server lookup, and that lookup is
 * an existence oracle over email addresses — which is why the server restricts
 * it to callers who already administer something. **That constraint lives in
 * the server.** This component takes `onAdd(email, role)` and does not know the
 * lookup exists; re-implementing the rule here would create a second place for
 * it to be wrong.
 *
 * `error` sets `aria-invalid` on the field as well as rendering the message, so
 * the two are associated rather than merely adjacent. That association was
 * missing from the hand-written version and is the one behaviour this
 * extraction adds.
 */
export function MemberInvite({
  drop,
  error,
  onAdd,
  roles = ROLES,
}: {
  drop: string;
  error?: string | null;
  onAdd(email: string, role: Role): void;
  roles?: readonly Role[];
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("reader");

  return (
    <Stack gap={1} data-part="member-invite">
      <Toolbar tight>
        <TextInput
          type="email"
          label={`add a member to ${drop}`}
          placeholder="colleague@example.org"
          value={email}
          invalid={Boolean(error)}
          onValueChange={setEmail}
        />
        <SelectInput
          label="role for the new member"
          size="tiny"
          value={role}
          options={roles.map((r) => ({ value: r, label: r }))}
          onValueChange={(next) => setRole(next as Role)}
        />
        <Button size="tiny" disabled={!email.trim()} onClick={() => onAdd(email, role)}>
          add
        </Button>
      </Toolbar>
      {error && <ErrorNotice size="tiny" message={error} />}
      <Text size="tiny" tone="faint" prose>
        They must have signed in here at least once. Removing someone takes
        effect immediately, including for every API token they hold.
      </Text>
    </Stack>
  );
}
