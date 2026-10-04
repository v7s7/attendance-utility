import type { AnchorHTMLAttributes, MouseEvent } from "react";
import { navigate } from "../router.ts";

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

/** An in-app link: changes the page without a reload, but Ctrl/middle-click still opens a new tab. */
export function Link({ href, onClick, ...props }: LinkProps) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(href);
  };
  return <a href={href} onClick={handle} {...props} />;
}
