import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { PARTS, STATES } from "./parts";
import type { PresentationType } from "./types";
import { usePbui } from "./usePbui";
import styles from "./pbui.module.css";

/**
 * A presentation: a typed, live handle to an object, drawn on screen.
 *
 * Ported from pbui-gog.jsx:54-77. Everything type-specific is resolved through
 * the registry — this component never learns what a chart is.
 */

export interface PresentationProps {
  ptype: PresentationType;
  value: unknown;
  /** Mouse-doc text. Falls back to the registry's label. */
  doc?: string;
  /**
   * Render an SVG <g> rather than an HTML <span>.
   *
   * This matters more than it looks. Inside an <svg> the renderer silently
   * discards HTML elements, so a <span> wrapper means the marks are never drawn
   * at all — no error, no warning, an empty chart. The prototype documents it
   * at :56-58 and it is the sharpest edge in the file.
   */
  svg?: boolean;
  block?: boolean;
  /** The left-click default verb, if this presentation has one. */
  onActivate?: () => void;
  /** What the default verb does, for the mouse-doc line. */
  activateDoc?: string;
  children: ReactNode;
  /** Stable hook for tests: data-testid. */
  testId?: string;
}

export function Presentation({
  ptype,
  value,
  doc,
  svg = false,
  block = false,
  onActivate,
  activateDoc,
  children,
  testId,
}: PresentationProps) {
  const pbui = usePbui();
  const acceptable = pbui.isAcceptable(ptype, value);

  const Tag = svg ? "g" : block ? "div" : "span";

  const clickDoc = acceptable
    ? "L: ACCEPT   R: menu"
    : onActivate
      ? `L: ${activateDoc ?? "activate"}   R: menu`
      : "L/R: menu";

  const describe = () => `${doc ?? `<${ptype}>`}   —   ${clickDoc}`;

  const open = (x: number, y: number) => pbui.openMenu(ptype, value, x, y);

  const onClick = (event: MouseEvent) => {
    // Presentations nest — a datum inside a tile inside a workspace — and
    // without this the outermost wins, which is exactly backwards. The most
    // specific presentation is the innermost one.
    event.stopPropagation();

    if (acceptable) {
      // In accept mode the left button satisfies rather than activates. A source
      // chip whose default verb is "load this" must not load anything while a
      // command is waiting for it; the mouse-doc line announces the change
      // before the user commits.
      event.preventDefault();
      pbui.satisfyAccept(ptype, value);
      return;
    }
    if (onActivate) {
      onActivate();
      return;
    }
    // No default verb: the left button opens the menu too. Otherwise chips
    // without an obvious primary action are dead to the left hand, and users
    // never discover the right button.
    open(event.clientX, event.clientY);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      if (acceptable) pbui.satisfyAccept(ptype, value);
      else if (onActivate) onActivate();
      else {
        const box = (event.target as HTMLElement).getBoundingClientRect();
        open(box.left, box.bottom);
      }
    }
    // The context-menu key, and Shift+F10 for keyboards without one.
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      event.stopPropagation();
      const box = (event.target as HTMLElement).getBoundingClientRect();
      open(box.left, box.bottom);
    }
  };

  return (
    <Tag
      data-part={svg ? PARTS.presentationSvg : PARTS.presentation}
      data-ptype={ptype}
      data-state={acceptable ? STATES.acceptable : undefined}
      data-testid={testId}
      className={svg ? styles.presentationSvg : styles.presentation}
      // Focusable, so the whole interface is reachable without a mouse. The
      // prototype is mouse-only, as Genera largely was; that is not acceptable
      // in something we ship (§15).
      tabIndex={0}
      role="button"
      aria-label={doc ?? ptype}
      onContextMenu={(event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        // Right-click opens the menu even in accept mode: a user who entered it
        // by mistake must still be able to interrogate what they are pointing at
        // without committing to it.
        open(event.clientX, event.clientY);
      }}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onMouseEnter={() => pbui.setMouseDoc(describe())}
      onMouseLeave={() => pbui.setMouseDoc(null)}
      onFocus={() => pbui.setMouseDoc(describe())}
      onBlur={() => pbui.setMouseDoc(null)}
    >
      {children}
    </Tag>
  );
}
