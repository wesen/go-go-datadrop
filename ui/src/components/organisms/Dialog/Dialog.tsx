import { useEffect, useId, useRef, type ReactNode } from "react";
import { Surface, Stack } from "../../layout";
import { Text } from "../../foundation";
import { IconButton } from "../../atoms";
import styles from "./Dialog.module.css";

/**
 * A modal panel: a backdrop, a focus trap, Escape to dismiss.
 *
 * The only modal in the tree, and the first — everything else in this interface
 * is a tile, a menu or a banner, which is deliberate. A dialog is warranted
 * here because import is a *decision with a text field in it*: the user has to
 * paste, read what the parser made of it, and confirm, and none of those fit in
 * an object menu.
 *
 * ## Not `<dialog showModal()>`, and the reason matters
 *
 * The native element renders in the **top layer**, above everything, and the
 * object menu (`pbui.module.css`'s `.menu`, a positioned `div` at z-index 100)
 * would then render *behind* it. That breaks right-clicking inside a dialog
 * and, more subtly, the pending-accept flow: an accept started from a dialog
 * must be satisfiable by clicking a presentation in a tile. The top layer is
 * not a z-index you can out-bid.
 *
 * So: a positioned overlay with an explicit z-index **below** the menu's. Same
 * reasoning that made DATADROP-7's full-frame control use `position: fixed`
 * rather than the Fullscreen API.
 *
 * ## The focus trap
 *
 * Tab and Shift-Tab cycle within the panel, and focus lands on the first
 * focusable element on open. Both are hand-written and both are about twenty
 * lines, which is cheaper than a dependency and — more to the point — is
 * inspectable: a focus trap that behaves surprisingly is very hard to debug
 * through a library.
 */
export interface DialogProps {
  /** The dialog's heading, and its accessible name. */
  title: string;
  /**
   * Called on Escape and on the ✕ — deliberately NOT on a backdrop click.
   *
   * Click-away is the usual affordance and it is wrong here: this dialog holds
   * text the user has pasted, and a stray click on the backdrop would discard
   * it with no undo. Two explicit routes out, both of which the user aimed at.
   */
  onClose(): void;
  children: ReactNode;
  /** The buttons along the bottom, right-aligned. */
  footer?: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not(:disabled), textarea, input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function Dialog({ title, onClose, children, footer }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const panel = ref.current;
    if (!panel) return;

    /*
     * Focus the first focusable thing in the BODY, not in the panel.
     *
     * The panel's first focusable element is the ✕ in the header, and focusing
     * that sends ⌘V nowhere. Found in Firefox, where a focused text area is not
     * a convenience but the entire import mechanism: the clipboard cannot be
     * read there, so the only way a bundle gets into the dialog is the user
     * pasting into a field that already has focus.
     *
     * The fallback to the panel keeps a dialog with no body controls — the
     * export confirmation — focusable and therefore Escape-able.
     */
    const body = panel.querySelector<HTMLElement>(`.${styles.body}`);
    const target =
      body?.querySelector<HTMLElement>(FOCUSABLE) ?? panel.querySelector<HTMLElement>(FOCUSABLE);
    target?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        // Not stopPropagation: an object menu opened INSIDE the dialog installs
        // its own Escape handler and must get the key first. It does, because
        // it is added later.
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0] as HTMLElement;
      const last = items[items.length - 1] as HTMLElement;
      const active = document.activeElement;

      // Wrap at both ends. Without the `!panel.contains` case, focus that has
      // already escaped — because something outside was focused
      // programmatically — never comes back.
      if (!panel.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    // The backdrop is inert: it dims and it blocks pointer events from reaching
    // the workbench, and it does not dismiss. See `onClose`.
    <div className={styles.backdrop}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={styles.panel}
      >
        <Surface tone="pane" border="firm" padding={4}>
          <Stack gap={3}>
            <div className={styles.head}>
              <Text id={titleId} size="title" strong>
                {title}
              </Text>
              <span className={styles.spacer} />
              <IconButton variant="framed" size="tiny" glyph="✕" label="close" onClick={onClose} />
            </div>
            <div className={styles.body}>{children}</div>
            {footer && <div className={styles.footer}>{footer}</div>}
          </Stack>
        </Surface>
      </div>
    </div>
  );
}
