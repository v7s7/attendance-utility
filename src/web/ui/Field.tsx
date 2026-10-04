import type { ReactNode } from "react";
import { cx } from "./cx.ts";

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** A label with its control, an optional hint underneath and an error message. */
export function Field({ label, hint, error, children, className }: FieldProps) {
  return (
    <label className={cx("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {error ? (
        <span className="text-xs text-red-600">{error}</span>
      ) : hint ? (
        <span className="text-xs leading-relaxed text-slate-500">{hint}</span>
      ) : null}
    </label>
  );
}

interface CheckProps {
  label: ReactNode;
  hint?: ReactNode;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

/** A checkbox with a label and an optional explanation. */
export function Check({ label, hint, checked, onChange, disabled }: CheckProps) {
  return (
    <label className={cx("flex items-start gap-2.5", disabled ? "opacity-60" : "cursor-pointer")}>
      <input
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 accent-teal-700"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        {hint ? <span className="text-xs leading-relaxed text-slate-500">{hint}</span> : null}
      </span>
    </label>
  );
}
