import { LoaderCircle, type LucideIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { cx } from "./cx.ts";

const VARIANTS = {
  primary: "bg-teal-700 text-white shadow-xs hover:bg-teal-800 focus-visible:ring-teal-600/30",
  secondary: "border border-slate-300 bg-white text-slate-700 shadow-xs hover:bg-slate-50 focus-visible:ring-slate-400/30",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-slate-400/30",
  danger: "border border-red-200 bg-white text-red-700 shadow-xs hover:bg-red-50 focus-visible:ring-red-500/25",
};

const SIZES = {
  sm: "h-8 gap-1.5 px-2.5 text-xs",
  md: "h-9 gap-2 px-3.5 text-sm",
};

interface ButtonProps extends ComponentProps<"button"> {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  icon?: LucideIcon;
  loading?: boolean;
}

export function Button({
  variant = "secondary",
  size = "md",
  icon: Icon,
  loading,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-lg font-medium whitespace-nowrap transition outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" /> : Icon ? <Icon className="size-4" /> : null}
      {children}
    </button>
  );
}
