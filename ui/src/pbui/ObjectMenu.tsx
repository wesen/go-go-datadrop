import { useEffect, useRef } from "react";
import { PARTS } from "./parts";
import { actionsFor, labelFor } from "./registry";
import { usePbui } from "./usePbui";
import styles from "./pbui.module.css";

/**
 * The object menu: the verbs of whatever was right-clicked.
 *
 * The header names the type, the object, and — for verbs that target the active
 * document ambiently — which document that is. That last part is what makes an
 * ambient verb safe: you are told where the change will land before you commit.
 */
export function ObjectMenu() {
  const pbui = usePbui();
  const ref = useRef<HTMLDivElement>(null);
  const menu = pbui.menu;

  useEffect(() => {
    if (!menu) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        pbui.closeMenu();
      }
    };
    const onClickAway = () => pbui.closeMenu();

    window.addEventListener("keydown", onKey);
    window.addEventListener("click", onClickAway);
    // Focus the first entry so the menu is usable from the keyboard the moment
    // it opens, rather than requiring a Tab into it.
    ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();

    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClickAway);
    };
  }, [menu, pbui]);

  if (!menu) return null;

  const actions = actionsFor(menu.ptype, menu.value, pbui.environment);
  const label = labelFor(menu.ptype, menu.value, pbui.environment);
  const ambient = ["field", "source", "geom"].includes(menu.ptype);

  // Clamp so the menu never opens off-screen. Ported from pbui-gog.jsx:2753.
  const left = Math.min(menu.x, window.innerWidth - 300);
  const top = Math.min(menu.y, window.innerHeight - 340);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const items = Array.from(
      ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
    );
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    }
  };

  return (
    <div
      ref={ref}
      data-part={PARTS.menu}
      role="menu"
      aria-label={`${menu.ptype} ${label}`}
      className={styles.menu}
      style={{ left, top }}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={onKeyDown}
    >
      <div data-part={PARTS.menuHeader} className={styles.menuHeader}>
        &lt;{menu.ptype}&gt; {label.slice(0, 32)}
        {ambient && (
          <span className={styles.menuTarget}>
            {" "}
            → chart {pbui.environment.nameOf(pbui.environment.activeDocId)}
          </span>
        )}
      </div>

      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          role="menuitem"
          data-part={PARTS.menuItem}
          className={styles.menuItem}
          disabled={action.disabledBecause !== undefined}
          title={action.disabledBecause}
          onClick={() => pbui.perform(action.verb)}
        >
          {action.label}
          {action.disabledBecause && (
            <span className={styles.menuReason}> — {action.disabledBecause}</span>
          )}
        </button>
      ))}

      {actions.length === 0 && (
        <div data-part={PARTS.menuItem} className={styles.menuItem}>
          <span className={styles.menuReason}>no verbs for this object yet</span>
        </div>
      )}
    </div>
  );
}
