/**
 * The `data-part` contract.
 *
 * These names are a public styling API: a theme targets them, and renaming one
 * breaks that theme silently. Keep the list short — every entry is something
 * you will be asked not to change.
 */
export const PARTS = {
  presentation: "presentation",
  presentationSvg: "presentation-svg",
  chip: "chip",
  chipLabel: "chip-label",
  chipBadge: "chip-badge",
  menu: "menu",
  menuHeader: "menu-header",
  menuItem: "menu-item",
  acceptBanner: "accept-banner",
  mouseDoc: "mouse-doc",
  tile: "tile",
  tileTitle: "tile-title",
  tileBody: "tile-body",
} as const;

/** `data-state` values. Meaning is never carried by colour alone (§15). */
export const STATES = {
  acceptable: "acceptable",
  active: "active",
  disabled: "disabled",
  stale: "stale",
  dragging: "dragging",
  truncated: "truncated",
} as const;
