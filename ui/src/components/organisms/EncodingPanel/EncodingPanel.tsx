import { CHANNELS, GEOMS } from "../../../model/chart";
import type { Channel, Geom } from "../../../model/chart";
import { Presentation } from "../../../pbui";
import { Button, FieldChip } from "../../atoms";
import { SectionLabel, Text } from "../../foundation";
import { AppBody, Stack } from "../../layout";
import { ChannelRow } from "../../molecules";
import styles from "./EncodingPanel.module.css";

/**
 * The aesthetic mapping: slot ↦ field, plus the geom and the y scale.
 *
 * Each ⌖ ACCEPTS a field, filtered to the types the channel can use (DR-10), so
 * an impossible mapping is unreachable rather than reported. The filter lives
 * in the container, because deciding which fields are acceptable needs the
 * pipeline's schema.
 *
 * ## `logUnavailable` is a prop, not a computation
 *
 * A log scale needs a strictly positive y domain, and deciding that means
 * scanning the y column of the pipeline's output. That is row work, and row
 * work does not belong in a panel — the same rule Part I of the DATADROP-6
 * follow-up guide is about. The container computes it; this component renders
 * a disabled button and a reason.
 *
 * Disabled with a reason rather than hidden, and `plot.ts` falls back as a
 * second line of defence. A control that vanishes teaches nothing about why.
 *
 * ## Staleness
 *
 * A channel mapped to a field the pipeline no longer produces renders STALE
 * with a warning rather than as a blank control. The predecessor shipped the
 * other behaviour: the select read as unset while the specification still held
 * the dead name and the plot refused to draw.
 */
export function EncodingPanel({
  geom,
  mapping,
  yScale,
  staleChannels = [],
  logUnavailable = false,
  docId,
  onGeom,
  onAccept,
  onClear,
  onYScale,
}: {
  geom: Geom | null;
  /** The current slot assignments. A null value is an unmapped channel. */
  mapping: Record<Channel, string | null>;
  yScale: "linear" | "log" | null;
  /** Channels whose mapped field is no longer in the pipeline output. */
  staleChannels?: readonly Channel[];
  /** True when the y domain includes a non-positive value. */
  logUnavailable?: boolean;
  docId: string | null;
  onGeom: (geom: Geom) => void;
  /** Ask the user to point at a field for this channel. */
  onAccept: (channel: Channel) => void;
  onClear: (channel: Channel) => void;
  onYScale: (scale: "linear" | "log") => void;
}) {
  const stale = new Set(staleChannels);

  return (
    <AppBody>
      <Stack gap={4}>
        <Stack gap={2}>
          <SectionLabel>Geom</SectionLabel>
          <Stack direction="row" gap={2} wrap>
            {GEOMS.map((option) => (
              <Presentation
                key={option}
                ptype="geom"
                value={option}
                doc={`<geom> ${option}`}
                onActivate={() => onGeom(option)}
                activateDoc="use this geom"
              >
                <span
                  className={[styles.geom, geom === option ? styles.selected : ""]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {option}
                </span>
              </Presentation>
            ))}
          </Stack>
        </Stack>

        <Stack gap={2}>
          <SectionLabel>Channels</SectionLabel>
          {CHANNELS.map((channel) => (
            <ChannelRow
              key={channel}
              channel={channel}
              mapped={mapping[channel]}
              stale={stale.has(channel)}
              onAcceptRequest={() => onAccept(channel)}
              onClear={() => onClear(channel)}
              // The DR-38 seam: the molecule draws the field's name, and the
              // panel makes it a live presentation so the mapped field can be
              // right-clicked from here exactly as from a table header.
              renderMapped={(name) => (
                <FieldChip field={{ docId, name }} testId={`mapped-${channel}`} />
              )}
            />
          ))}
        </Stack>

        <Stack gap={2}>
          <SectionLabel>Y scale</SectionLabel>
          <Stack direction="row" gap={2} align="center">
            {(["linear", "log"] as const).map((scale) => (
              <Button
                key={scale}
                variant="framed"
                selected={yScale === scale}
                disabled={scale === "log" && logUnavailable}
                title={
                  scale === "log" && logUnavailable
                    ? "a log scale needs a strictly positive y domain"
                    : undefined
                }
                onClick={() => onYScale(scale)}
              >
                {scale}
              </Button>
            ))}
            {logUnavailable && (
              <Text size="tiny" tone="faint">
                log needs y &gt; 0 throughout
              </Text>
            )}
          </Stack>
        </Stack>
      </Stack>
    </AppBody>
  );
}
