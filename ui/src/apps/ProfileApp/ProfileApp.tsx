import { useState } from "react";
import {
  useListDropsQuery,
  useListSessionsQuery,
  useMeQuery,
  useSignOutMutation,
} from "../../api/client";
import { registerApp, type AppProps } from "../../appkit/registry";
import { AppBody } from "../../components/layout";
import { Text } from "../../components/foundation";
import { ProfilePanel } from "../../components/organisms";
import { MemberList } from "./MemberList";

/**
 * Who you are, what you can see, and where you are signed in — the container.
 *
 * Four hooks and one piece of local state; everything visible is
 * `ProfilePanel`. The reason the split matters here specifically: this tile has
 * three states that need a particular *server* to reach — the root principal,
 * token mode, and a first-day account with no drops — and all three are now
 * stories (guide §18.2).
 */
function ProfileApp(_props: AppProps) {
  const { data: me } = useMeQuery();
  const { data: drops } = useListDropsQuery();
  const { data: sessions } = useListSessionsQuery(undefined, {
    skip: me?.kind !== "session",
  });
  const [signOut] = useSignOutMutation();
  // One drop's access list at a time: showing every list at once means a
  // request per drop on a page that is mostly not about membership.
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!me?.authenticated) {
    return (
      <AppBody>
        <Text size="small" tone="faint">
          not signed in
        </Text>
      </AppBody>
    );
  }

  return (
    <ProfilePanel
      user={
        me.user
          ? {
              id: me.user.id,
              name: me.user.name ?? null,
              email: me.user.email ?? null,
              created_at: me.user.created_at,
            }
          : null
      }
      kind={me.kind}
      drops={(drops?.drops ?? []).map((drop) => ({
        name: drop.name,
        your_role: drop.your_role ?? null,
        public_read: drop.public_read ?? false,
        owner_id: drop.owner_id ?? null,
      }))}
      sessions={sessions?.sessions.map((session) => ({
        id: session.id,
        current: session.current,
        user_agent: session.user_agent ?? null,
        created_at: session.created_at,
        ip: session.ip ?? null,
      }))}
      provider={me.provider ? { account_url: me.provider.account_url } : null}
      expandedDrop={expanded}
      onToggleDrop={(drop) => setExpanded((current) => (current === drop ? null : drop))}
      onSignOut={(global) => void signOut(global ? { global: true } : undefined)}
      renderDropAccess={(drop) => (
        <MemberList
          drop={drop.name}
          yourRole={drop.your_role ?? ""}
          unowned={!drop.owner_id}
        />
      )}
    />
  );
}

registerApp({
  id: "profile",
  title: "profile",
  tone: "var(--pbui-tone-doc)",
  docBound: false,
  Component: ProfileApp,
});
