import { Presentation } from "../../../pbui";
import type { UserRef } from "../../../pbui";
import { Chip } from "../Chip";

/** `<user>` on screen. */
export function UserChip({ user, you = false }: { user: UserRef; you?: boolean }) {
  return (
    <Presentation
      ptype="user"
      value={user}
      doc={`<user> ${user.name}${user.email ? ` · ${user.email}` : ""}`}
    >
      <Chip
        label={you ? `${user.name} · you` : user.name}
        tone="var(--pbui-tone-doc)"
        strong={you}
        state={you ? "active" : undefined}
        title={user.email ?? user.id}
      />
    </Presentation>
  );
}
