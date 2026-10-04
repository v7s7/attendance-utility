import { CircleCheck, Info, Lock, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "./cx.ts";

const TONES = {
  info: { box: "border-sky-200 bg-sky-50 text-sky-900", icon: Info },
  warning: { box: "border-amber-200 bg-amber-50 text-amber-900", icon: TriangleAlert },
  danger: { box: "border-red-200 bg-red-50 text-red-800", icon: TriangleAlert },
  success: { box: "border-emerald-200 bg-emerald-50 text-emerald-900", icon: CircleCheck },
  locked: { box: "border-slate-300 bg-slate-100 text-slate-800", icon: Lock },
} satisfies Record<string, { box: string; icon: LucideIcon }>;

interface AlertProps {
  tone?: keyof typeof TONES;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function Alert({ tone = "info", children, action, className }: AlertProps) {
  const { box, icon: Icon } = TONES[tone];
  return (
    <div
      className={cx("flex items-start gap-3 rounded-lg border px-4 py-3 text-sm leading-relaxed", box, className)}
      role={tone === "danger" ? "alert" : "status"}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}
