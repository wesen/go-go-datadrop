import { Presentation, usePbui } from "../../../pbui";
import type { DocId } from "../../../pbui";
import { Chip } from "../Chip";

/**
 * `<doc>` on screen — a live chart document (α, β, γ …).
 *
 * The active document is marked, unmissably. Verbs fired from a chip that names
 * no document land there, and a user who cannot see which document is active
 * cannot predict where a menu entry will act.
 */
export function DocChip({ docId, testId }: { docId: DocId; testId?: string }) {
  const pbui = usePbui();
  const active = pbui.environment.activeDocId === docId;
  const name = pbui.environment.nameOf(docId);

  return (
    <Presentation
      ptype="doc"
      value={docId}
      doc={`<doc> chart ${name}${active ? " · ACTIVE" : ""}`}
      onActivate={() => pbui.perform({ kind: "setActiveDoc", docId })}
      activateDoc="make it the ACTIVE chart"
      testId={testId}
    >
      <Chip
        label={active ? `${name} · active` : name}
        tone="var(--pbui-tone-doc)"
        strong
        state={active ? "active" : undefined}
      />
    </Presentation>
  );
}
