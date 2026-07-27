import type { ReactNode } from "react";
import { CHANNEL_ACCEPTS } from "../../../model/chart";
import type { Channel } from "../../../model/chart";
import { TYPE_LABEL } from "../../../model/table";
import { Stack } from "../../layout";
import { Text } from "../../foundation";
import { IconButton } from "../../atoms";
import styles from "./ChannelRow.module.css";

/**
 * One encoding channel, and the field mapped into it.
 *
 * This component existed **twice** before it existed once: in `EncodingApp`,
 * and again in `pbui/Pbui.stories.tsx`, which needed a channel row to
 * demonstrate the accept protocol, had nothing to import, and wrote its own.
 * The two have been drifting since. That is the same failure as the six copies
 * of the button style, in a different costume — and it is the cleanest possible
 * argument that "a component with no story" and "a story with no component" are
 * one problem.
 *
 * The ⌖ button is the accept protocol's entry point: pressing it puts a command
 * into the waiting state, and only fields the channel can accept stay live.
 * That is the behaviour the story exists to demonstrate, so the row takes
 * `onAcceptRequest` and knows nothing about how an accept is performed.
 *
 * `renderMapped` is the DR-38 seam: EncodingApp renders the mapped field as a
 * live `FieldChip`, and the default renders its name, so a story needs no
 * provider.
 */
export function ChannelRow({
  channel,
  mapped,
  stale = false,
  onAcceptRequest,
  onClear,
  renderMapped,
}: {
  channel: Channel;
  mapped: string | null;
  /** The mapped field is no longer in the pipeline output. */
  stale?: boolean;
  onAcceptRequest(): void;
  onClear(): void;
  renderMapped?: (name: string) => ReactNode;
}) {
  return (
    <Stack direction="row" gap={3} align="center" wrap data-part="channel-row">
      <Text size="small" strong>
        <span className={styles.channel}>{channel}</span>
      </Text>

      {mapped ? (
        (renderMapped?.(mapped) ?? <Text size="small">{mapped}</Text>)
      ) : (
        <Text size="small" tone="faint">
          — unmapped —
        </Text>
      )}

      {stale && (
        <Text size="tiny" tone="danger">
          ⚠ not in the pipeline output — a step removed it
        </Text>
      )}

      <IconButton
        variant="framed"
        glyph="⌖"
        label={`accept a field for ${channel}`}
        title={`accept a <field> for ${channel} — click one anywhere`}
        onClick={onAcceptRequest}
      />
      <IconButton
        variant="framed"
        glyph="×"
        label={`clear ${channel}`}
        disabled={!mapped}
        onClick={onClear}
      />

      <Text size="tiny" tone="faint">
        {CHANNEL_ACCEPTS[channel].map((t) => TYPE_LABEL[t]).join(" / ")}
      </Text>
    </Stack>
  );
}
