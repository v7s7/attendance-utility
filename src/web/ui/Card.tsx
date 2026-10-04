import type { ReactNode } from "react";
import { cx } from "./cx.ts";

interface CardProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Tables sit flush with the card edges and scroll sideways on narrow screens. */
  flush?: boolean;
}

export function Card({ title, description, actions, children, className, flush }: CardProps) {
  return (
    <section className={cx("rounded-xl border border-slate-200 bg-white shadow-xs", className)}>
      {title || actions ? (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            {title ? <h2 className="text-base font-semibold text-slate-900">{title}</h2> : null}
            {description ? <p className="mt-1 text-sm leading-relaxed text-slate-500">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      {children ? <div className={flush ? "overflow-x-auto" : "p-5"}>{children}</div> : null}
    </section>
  );
}
