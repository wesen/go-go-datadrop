import { AppBody, Stack, Surface, Toolbar } from "../layout";
import { Kbd, SectionLabel, Text } from "../foundation";

/**
 * The placeholder that stands in for the workbench between phase 0 and phase 3.
 *
 * It exists to keep `bun run build` producing something honest, and it doubles
 * as the first real exercise of the foundation and layout primitives: if
 * Surface, Stack, Toolbar and AppBody cannot assemble this much, they are wrong
 * before a single atom is written.
 *
 * Delete it in phase 3, when pages/Workbench takes over.
 */
export function UnderConstruction() {
  return (
    <Stack gap={0} className="pbui-shell">
      <Surface tone="inverted" border="none">
        <Toolbar>
          <Text size="title" strong>
            <span style={{ letterSpacing: "var(--pbui-track-banner)" }}>
              DATADROP — GRAMMAR OF GRAPHICS
            </span>
          </Text>
        </Toolbar>
      </Surface>

      <AppBody>
        <Stack gap={4} align="start">
          <Surface border="firm" elevation="raised" padding={4}>
            <Stack gap={3}>
              <SectionLabel>Status</SectionLabel>
              <Text size="title" strong>
                The workbench is being rebuilt.
              </Text>
              <Text tone="faint" prose>
                DATADROP-4 replaces the single-chart layout with a
                presentation-based tiled shell. The old shell has been removed;
                the new one arrives in phase 3.
              </Text>
              <Text tone="faint" prose>
                Until then the development surface is Storybook —{" "}
                <Kbd>bun run storybook</Kbd> — and the running binary continues
                to serve the previous interface from its embedded bundle.
              </Text>
            </Stack>
          </Surface>

          <Stack gap={2}>
            <SectionLabel>What still works</SectionLabel>
            <Text size="small" tone="faint">
              the whole API · the grammar-of-graphics engine in src/model · 67
              unit tests · the committed bundle the Go binary serves
            </Text>
          </Stack>
        </Stack>
      </AppBody>
    </Stack>
  );
}
