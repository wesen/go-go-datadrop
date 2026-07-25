import { effectiveType } from "../../../model/table";
import { Presentation, usePbui } from "../../../pbui";
import { resolveField } from "../../../pbui/descriptors/field";
import type { FieldRef } from "../../../pbui";
import { Chip } from "../Chip";
import { ProvenanceBadge } from "../ProvenanceBadge";
import { TypeBadge } from "../TypeBadge";

/**
 * `<field>` on screen — the atom of the workbench.
 *
 * Renders the type as a LETTER as well as a hue. That is a requirement, not a
 * flourish: the presentation tones sit below the non-text contrast threshold,
 * and the exemption holds only while the type is also carried textually
 * (test/tokens.test.ts pins the premise).
 *
 * A field the pipeline no longer produces renders stale, with a warning, rather
 * than vanishing. EncodingEditor.tsx shipped the other behaviour — the control
 * read as unset while the specification still held the dead name and the plot
 * refused — and it is the exact shape of defect this workbench is supposed to
 * make impossible.
 */
export function FieldChip({ field: ref, testId }: { field: FieldRef; testId?: string }) {
  const pbui = usePbui();
  const { field, type } = resolveField(ref, pbui.environment);

  const missing = field === null || type === null;
  const overridden = field !== null && type !== null && field.type !== type;

  const doc = missing
    ? `<field> ${ref.name} — not in the pipeline output`
    : `<field> ${ref.name} (${type}, ${field.inferred_from})`;

  return (
    <Presentation ptype="field" value={ref} doc={doc} testId={testId ?? `chip-${ref.name}`}>
      <Chip
        label={missing ? `${ref.name} ⚠` : ref.name}
        tone="var(--pbui-tone-field)"
        state={missing ? "stale" : undefined}
        title={
          missing
            ? `${ref.name} is not in the pipeline output — a step may have removed it`
            : undefined
        }
        badge={
          missing ? null : (
            <>
              <TypeBadge type={effectiveType(field, pbui.environment.overridesFor(ref.docId))} overridden={overridden} />
              <ProvenanceBadge source={field.inferred_from} />
            </>
          )
        }
      />
    </Presentation>
  );
}
