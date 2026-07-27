import type { ReactNode } from "react";
import { AppBody, Stack, Toolbar } from "../../layout";
import { Divider, SectionLabel, Text } from "../../foundation";
import { Button, LinkAction, RoleBadge, SourceChip, UserChip, type Role } from "../../atoms";
import { Callout, EmptyState } from "../../molecules";

export interface ProfileUser {
  id: string;
  name: string | null;
  email: string | null;
  created_at: string;
}

export interface ProfileDrop {
  name: string;
  your_role: string | null;
  public_read: boolean;
  owner_id: string | null;
}

export interface ProfileSession {
  id: string;
  current: boolean;
  user_agent: string | null;
  created_at: string;
  ip: string | null;
}

/**
 * Who you are, what you can see, and where you are signed in.
 *
 * Everything is read-only except sign-out, because name, email, password and
 * MFA belong to the identity provider. The panel says so in one sentence rather
 * than leaving a reader to conclude the fields are broken.
 *
 * **Defect 2 of DATADROP-5 lived here**: a "Signed in on" heading rendered with
 * an empty body for the root principal, which has no session and no user
 * record. Reaching that by clicking needs a root credential. Reaching it here
 * needs `user={null}`.
 */
export function ProfilePanel({
  user,
  kind,
  drops,
  sessions,
  provider,
  expandedDrop,
  onToggleDrop,
  onSignOut,
  renderDropAccess,
}: {
  /** Null for the root principal, which has no user record. */
  user: ProfileUser | null;
  kind: string;
  drops: readonly ProfileDrop[];
  /** Undefined while loading; empty is a real and different state. */
  sessions?: readonly ProfileSession[];
  provider?: { account_url: string } | null;
  expandedDrop?: string | null;
  onToggleDrop?(drop: string): void;
  onSignOut(global: boolean): void;
  /** The member list for one drop. Supplied by the container, which fetches it. */
  renderDropAccess?: (drop: ProfileDrop) => ReactNode;
}) {
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
                {user.email ?? "no email on file"} · member since {user.created_at.slice(0, 10)}
              </Text>
            </Stack>
          ) : (
            <Text size="small" tone="faint">
              signed in as the root principal — there is no user record for it
            </Text>
          )}
          {/* Only where there is an identity provider to point at. In token
              mode this prose would describe a system that is not there. */}
          {provider && (
            <>
              <Text size="tiny" tone="faint" prose>
                Your name, email, password and two-factor settings live in the identity provider.
                datadrop keeps a copy of the first two, refreshed each time you sign in.
              </Text>
              <LinkAction href={provider.account_url} target="_blank" rel="noreferrer">
                Manage your account →
              </LinkAction>
            </>
          )}
        </Stack>

        <Divider />

        <Stack gap={2}>
          <SectionLabel>Drops you can see</SectionLabel>
          {drops.length === 0 ? (
            <EmptyState
              message="none yet"
              hint="A drop becomes visible when someone adds you to it, or when it is public."
            />
          ) : (
            <Stack gap={1}>
              {drops.map((drop) => (
                <Stack key={drop.name} gap={1}>
                  <Toolbar tight>
                    <SourceChip source={{ drop: drop.name, kind: "stream", stream: "events" }} />
                    {/* your_role is computed by the server so the interface can
                        disable an action it knows will 403, rather than
                        offering it and failing. */}
                    <RoleBadge role={(drop.your_role ?? "") as Role} />
                    {drop.public_read && (
                      <Text size="tiny" tone="faint">
                        public
                      </Text>
                    )}
                    {renderDropAccess && (
                      <Button size="tiny" onClick={() => onToggleDrop?.(drop.name)}>
                        {expandedDrop === drop.name ? "hide access" : "access"}
                      </Button>
                    )}
                  </Toolbar>
                  {expandedDrop === drop.name && renderDropAccess && (
                    <div style={{ paddingLeft: "var(--pbui-space-4)" }}>
                      {renderDropAccess(drop)}
                    </div>
                  )}
                </Stack>
              ))}
            </Stack>
          )}
        </Stack>

        {kind === "session" && (
          <>
            <Divider />
            <Stack gap={2}>
              <SectionLabel>Signed in on</SectionLabel>
              {/*
                Three states, not two. `undefined` is still loading; `[]` is a
                real answer and must not render as a bare heading with nothing
                under it — which is the shape of the defect this panel shipped
                for the root principal.
              */}
              {sessions === undefined ? (
                <Text size="tiny" tone="faint">
                  loading…
                </Text>
              ) : sessions.length === 0 ? (
                <EmptyState size="tiny" message="no other sessions" />
              ) : (
                sessions.map((session) => (
                  <Toolbar key={session.id} tight>
                    <Text size="small" strong={session.current}>
                      {session.current ? "this browser" : session.user_agent || "unknown client"}
                    </Text>
                    <Text size="tiny" tone="faint">
                      since {session.created_at.slice(0, 16).replace("T", " ")}
                      {session.ip ? ` · ${session.ip}` : ""}
                    </Text>
                  </Toolbar>
                ))
              )}

              <Callout>
                <Stack gap={2}>
                  <Toolbar tight>
                    <Button onClick={() => onSignOut(false)} data-testid="sign-out">
                      Sign out
                    </Button>
                    <Button onClick={() => onSignOut(true)}>Sign out everywhere</Button>
                  </Toolbar>
                  {/* Said plainly because it surprises people: a local sign-out
                      leaves you signed in AT THE PROVIDER, so clicking "sign
                      in" signs you straight back in with no prompt. */}
                  <Text size="tiny" tone="faint" prose>
                    Signing out ends this session here. You stay signed in at the identity provider,
                    so signing back in will not ask for a password — use “sign out everywhere” to
                    end that too.
                  </Text>
                </Stack>
              </Callout>
            </Stack>
          </>
        )}
      </Stack>
    </AppBody>
  );
}
