import type { ReactNode } from "react";

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** A small line above the title, e.g. a back link. */
  eyebrow?: ReactNode;
  badge?: ReactNode;
}

export function PageHeader({ title, description, actions, eyebrow, badge }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1.5 text-sm text-slate-500">{eyebrow}</div> : null}
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          {badge}
        </div>
        {description ? <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
