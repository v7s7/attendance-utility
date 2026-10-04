// Input validation for the API. Anything that does not match is rejected with 400.
import { z } from "zod";
import { isDate, monthsBetween } from "../core/time.ts";
import { EXCUSES } from "../core/types.ts";

export const DateStr = z.string().refine(isDate, "invalid_date");
export const MonthStr = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

/** A period of whole months, from :from to :to in the address, at most two years. */
export function periodParams(params: unknown): { from: string; to: string } {
  return z
    .object({ from: MonthStr, to: MonthStr })
    .refine((p) => p.from <= p.to, "invalid_period")
    .refine((p) => monthsBetween(`${p.from}-01`, `${p.to}-01`).length <= 24, "period_too_long")
    .parse(params);
}
export const TimeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/);
export const DurationStr = z.string().regex(/^\d{1,2}:[0-5]\d$/);

export const Username = z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9._-]+$/);
export const Password = z.string().min(8).max(200);
export const DisplayName = z.string().trim().min(1).max(80);
export const RoleSchema = z.enum(["admin", "hr"]);

export const ExcuseSchema = z.enum(EXCUSES);

export const WageSchema = z.object({
  mode: z.enum(["table", "custom"]).optional(),
  scale: z.string().max(20).optional(),
  grade: z.number().int().min(0).max(20).optional(),
  step: z.number().int().min(0).max(15).optional(),
  rate: z.number().positive().max(1000).optional(),
});

export const RulesSchema = z.object({
  deductEarlyLeave: z.boolean(),
  allowanceHours: z.number().min(0).max(200),
  absenceMode: z.enum(["list", "deduct"]),
  incompleteMode: z.enum(["hold", "deduct"]),
  permissionLimitCount: z.number().int().min(0).max(31),
  permissionLimitTime: DurationStr,
  duplicateWindowMin: z.number().int().min(0).max(120),
});

export const ScheduleSchema = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(["flexible", "fixed", "hours"]),
  start: TimeStr,
  latestStart: TimeStr,
  hours: z.array(DurationStr.nullable()).length(7),
});

export const TimecardRowSchema = z.object({
  employeeId: z.string().trim().min(1).max(40),
  name: z.string().max(200),
  department: z.string().max(200),
  date: DateStr,
  times: z.array(TimeStr).max(50),
  invalid: z.array(z.string().max(50)).max(50),
});
