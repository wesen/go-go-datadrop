import { PARTS } from "../../../pbui/parts";
import styles from "./RoleBadge.module.css";

export type Role = "reader" | "writer" | "admin" | "";

/**
 * What a caller may do to a drop, in one glyph.
 *
 * A badge rather than a colour: the tone scale is already carrying presentation
 * type, and stacking a second meaning on it would make both unreadable. §10.3's
 * rule that a tone is never the sole carrier of information applies here too.
 */
export function RoleBadge({ role }: { role: Role }) {
  if (!role) return null;
  return (
    <span
      data-part={PARTS.roleBadge}
      className={styles.badge}
      // "an admin", not "a admin". A screen reader says this out loud.
      title={`you are ${role === "admin" ? "an" : "a"} ${role}`}
    >
      {role[0]?.toUpperCase()}
    </span>
  );
}
