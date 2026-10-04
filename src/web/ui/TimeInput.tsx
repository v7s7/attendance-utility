import type { ComponentProps } from "react";
import { parseTypedTime } from "../../core/time.ts";
import { cx } from "./cx.ts";

interface TimeInputProps extends Omit<ComponentProps<"input">, "value" | "onChange" | "type"> {
  value: string;
  onChange: (value: string) => void;
  /** For an OUT time: the IN time, so "230" is read as 14:30. */
  after?: string | null;
}

/** A plain box for a time: HR types 715 or 1430 and it becomes 07:15 or 14:30 when they leave the box. */
export function TimeInput({ value, onChange, after, className, onBlur, ...props }: TimeInputProps) {
  const parsed = parseTypedTime(value, after);
  return (
    <input
      type="text"
      inputMode="numeric"
      dir="ltr"
      autoComplete="off"
      placeholder="--:--"
      maxLength={5}
      aria-invalid={parsed === null}
      className={cx("input text-start tabular-nums", parsed === null && "border-red-400 ring-1 ring-red-300", className)}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => {
        if (parsed) onChange(parsed);
        onBlur?.(e);
      }}
      {...props}
    />
  );
}
