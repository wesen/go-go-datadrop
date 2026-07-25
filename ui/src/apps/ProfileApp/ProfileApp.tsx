import { useState } from "react";
import {
  useListDropsQuery,
  useListSessionsQuery,
  useMeQuery,
  useSignOutMutation,
} from "../../api/client";
import { registerApp, type AppProps } from "../registry";
import { AppBody, Stack, Surface, Toolbar } from "../../components/layout";
import { Divider, SectionLabel, Text } from "../../components/foundation";
import { Button, RoleBadge, SourceChip, UserChip, type Role } from "../../components/atoms";
import { MemberList } from "./MemberList";

/**
 * Who you are, what you can see, and where you are signed in.
 *
 * Everything here is read-only except sign-out and session revocation, because
 * name, email, password and MFA belong to the identity provider (guide §5.4).
 * The tile says so in one sentence rather than leaving a user to conclude the
 * fields are broken.
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

  const user = me.user;

  return (
    <AppBody>
      <Stack gap={4}>
        <Stack gap={2}>
          <SectionLabel>You</SectionLabel>
          {user ? (
            <Stack gap={1}>
              <UserChip
                user={{ id: user.id, name: user.name ?? user.id, email: user.email ?? null }}
                you
              />
              <Text size="tiny" tone="faint">
                {user.email ?? "no email on file"} · member since{" "}
                {user.created_at.slice(0, 10)}
              </Text>
            </Stack>
          ) : (
            <Text size="small" tone="faint">
              signed in as the root principal — there is no user record for it
            </Text>
          )}
          {/* Only where there is an identity provider to point at. In token
              mode this prose would describe a system that is not there. */}
          {me.provider && (
            <>
              <Text size="tiny" tone="faint" prose>
                Your name, email, password and two-factor settings live in the
                identity provider. datadrop keeps a copy of the first two,
                refreshed each time you sign in.
              </Text>
              <a href={me.provider.account_url} target="_blank" rel="noreferrer">
                <Text size="small" strong>
                  Manage your account →
                </Text>
              </a>
            </>
          )}
        </Stack>

        <Divider />

        <Stack gap={2}>
          <SectionLabel>Drops you can see</SectionLabel>
          {drops?.drops.length ? (
            <Stack gap={1}>
              {drops.drops.map((drop) => (
                <Stack key={drop.name} gap={1}>
                  <Toolbar tight>
                    <SourceChip source={{ drop: drop.name, kind: "stream", stream: "events" }} />
                    {/* your_role is computed by the server so the UI can grey
                        out an action it knows will 403, rather than offering it
                        and failing. */}
                    <RoleBadge role={(drop.your_role ?? "") as Role} />
                    {drop.public_read && (
                      <Text size="tiny" tone="faint">
                        public
                      </Text>
                    )}
                    <Button
                      size="tiny"
                      onClick={() =>
                        setExpanded((current) => (current === drop.name ? null : drop.name))
                      }
                    >
                      {expanded === drop.name ? "hide access" : "access"}
                    </Button>
                  </Toolbar>
                  {expanded === drop.name && (
                    <div style={{ paddingLeft: "var(--pbui-space-4)" }}>
                      <MemberList
                        drop={drop.name}
                        yourRole={drop.your_role ?? ""}
                        unowned={!drop.owner_id}
                      />
                    </div>
                  )}
                </Stack>
              ))}
            </Stack>
          ) : (
            <Text size="small" tone="faint">
              none yet
            </Text>
          )}
        </Stack>

        {me.kind === "session" && (
          <>
            <Divider />
            <Stack gap={2}>
              <SectionLabel>Signed in on</SectionLabel>
              {sessions?.sessions.map((session) => (
                <Toolbar key={session.id} tight>
                  <Text size="small" strong={session.current}>
                    {session.current
                      ? "this browser"
                      : session.user_agent || "unknown client"}
                  </Text>
                  <Text size="tiny" tone="faint">
                    since {session.created_at.slice(0, 16).replace("T", " ")}
                    {session.ip ? ` · ${session.ip}` : ""}
                  </Text>
                </Toolbar>
              ))}

              <Surface tone="alt">
                <Stack gap={2}>
                  <Toolbar tight>
                    <Button onClick={() => void signOut()} data-testid="sign-out">
                      Sign out
                    </Button>
                    <Button onClick={() => void signOut({ global: true })}>
                      Sign out everywhere
                    </Button>
                  </Toolbar>
                  {/* Said plainly because it surprises people: local sign-out
                      leaves you signed in AT THE PROVIDER, so clicking "sign
                      in" signs you straight back in with no prompt. */}
                  <Text size="tiny" tone="faint" prose>
                    Signing out ends this session here. You stay signed in at the
                    identity provider, so signing back in will not ask for a
                    password — use “sign out everywhere” to end that too.
                  </Text>
                </Stack>
              </Surface>
            </Stack>
          </>
        )}
      </Stack>
    </AppBody>
  );
}

registerApp({
  id: "profile",
  title: "profile",
  tone: "var(--pbui-tone-doc)",
  docBound: false,
  Component: ProfileApp,
});
