import type { AnchorHTMLAttributes, ReactNode } from "react";
import type { ButtonSize, ButtonVariant } from "../Button";
import styles from "./LinkAction.module.css";

/**
 * An action that has to be a navigation.
 *
 * "Why is this not a Button?" is the first question a reviewer asks, and the
 * answer is specific rather than stylistic: an OIDC authorization request is a
 * top-level navigation, not an XHR. It cannot be performed with `fetch` — the
 * provider's response is an HTML login page on another origin, and attempting
 * it is the standard afternoon lost to CORS. SignInApp says so in a comment
 * already; this atom is where that comment stops being per-call-site knowledge.
 *
 * So the element must be an `<a href>`, and this exists so its appearance is
 * *shared* with Button rather than approximated next to it. It takes the same
 * `variant` and `size` and reads from the same class vocabulary.
 *
 * It deliberately does not take an `onClick`. A link that runs script instead
 * of navigating is a button wearing a link's clothes, and it breaks
 * middle-click, copy-link and open-in-new-tab. If you need script, use Button.
 */
export interface LinkActionProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "onClick"> {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

export function LinkAction({
  href,
  variant = "bare",
  size = "small",
  className,
  children,
  ...rest
}: LinkActionProps) {
  return (
    <a
      href={href}
      className={[styles.root, styles[variant], styles[size], className ?? ""]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </a>
  );
}
