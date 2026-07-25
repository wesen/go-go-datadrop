import { describeSource } from "../../../model/chart";
import type { SourceRef } from "../../../model/table";
import { Presentation, usePbui } from "../../../pbui";
import { Chip } from "../Chip";

/**
 * `<source>` on screen — a stream or a dataset file.
 *
 * Its default verb loads it into the active document, and the mouse-doc line
 * says so before the click. In accept mode Presentation suppresses that verb,
 * which is why a source chip does not load anything while a command is waiting
 * for one.
 */
export function SourceChip({
  source,
  strong = false,
  testId,
}: {
  source: SourceRef;
  strong?: boolean;
  testId?: string;
}) {
  const pbui = usePbui();
  const name = pbui.environment.nameOf(pbui.environment.activeDocId);

  return (
    <Presentation
      ptype="source"
      value={source}
      doc={`<source> ${describeSource(source)}`}
      onActivate={() =>
        pbui.perform({ kind: "setSource", docId: pbui.environment.activeDocId, source })
      }
      activateDoc={`load into chart ${name}`}
      testId={testId}
    >
      <Chip label={describeSource(source)} tone="var(--pbui-tone-source)" strong={strong} />
    </Presentation>
  );
}
