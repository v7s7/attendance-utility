import { Info } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "./cx.ts";

const COLORS = { danger: "text-red-700", warning: "text-amber-700", teal: "text-teal-800" };

interface StatProps {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: keyof typeof COLORS;
  /** How the number is worked out, shown on hover. */
  hint?: string;
}

export function Stat({ label, value, sub, tone, hint }: StatProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-xs" title={hint}>
      <div className="flex items-center gap-1 text-xs font-medium text-slate-500">
        {label}
        {hint ? <Info className="size-3.5 text-slate-400" /> : null}
      </div>
      <div className={cx("mt-1.5 text-xl font-semibold tracking-tight", tone ? COLORS[tone] : "text-slate-900")}>{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-slate-500">{sub}</div> : null}
    </div>
  );
}
