import type {
  ApiErrorBody,
  AuditEntry,
  EmployeeMonthReport,
  EmployeePeriodReport,
  EmployeeUpdate,
  EmployeeView,
  ImportDeleted,
  ImportRecord,
  ImportResult,
  MonthListItem,
  MonthOverview,
  MonthReview,
  Organization,
  PeriodOverview,
  Role,
  SettingsData,
  User,
} from "../core/api.ts";
import type { TimecardRow } from "../core/timecard.ts";
import type { Adjustment, Excuse, Holiday, Rules, Schedule } from "../core/types.ts";

/** A failed request. `code` is a key under "error." in the translations. */
export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.status = status;
    this.code = code;
  }
}

let onUnauthorized: (() => void) | null = null;

/** Called when the session has ended so the app can show the sign-in page. */
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch("/api" + path, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "network");
  }

  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = data as ApiErrorBody | null;
    if (res.status === 401 && err?.error !== "login_failed") onUnauthorized?.();
    throw new ApiError(res.status, err?.error ?? "server_error", err?.message);
  }
  return data as T;
}

const enc = encodeURIComponent;
type ScheduleInput = Omit<Schedule, "id">;

export const api = {
  status: () => request<{ user: User | null }>("GET", "/auth/status"),
  login: (username: string, password: string) => request<{ user: User }>("POST", "/auth/login", { username, password }),
  logout: () => request<{ ok: true }>("POST", "/auth/logout"),
  changePassword: (current: string, next: string) => request<{ ok: true }>("POST", "/account/password", { current, next }),

  settings: () => request<SettingsData>("GET", "/settings"),
  saveSettings: (body: Partial<{ rules: Rules; organization: Organization; defaultScheduleId: number }>) =>
    request<{ ok: true }>("PUT", "/settings", body),
  createSchedule: (s: ScheduleInput) => request<Schedule>("POST", "/schedules", s),
  updateSchedule: (id: number, s: ScheduleInput) => request<Schedule>("PUT", `/schedules/${id}`, s),
  deleteSchedule: (id: number) => request<{ ok: true }>("DELETE", `/schedules/${id}`),
  holidays: () => request<Holiday[]>("GET", "/holidays"),
  addHoliday: (body: { from: string; to: string; name: string }) => request<{ days: number }>("POST", "/holidays", body),
  deleteHolidays: (from: string, to: string) => request<{ days: number }>("DELETE", "/holidays", { from, to }),

  employees: () => request<EmployeeView[]>("GET", "/employees"),
  employeeMonths: (id: string) => request<string[]>("GET", `/employees/${enc(id)}/months`),
  employeePeriod: (id: string, from: string, to: string) =>
    request<EmployeePeriodReport>("GET", `/employees/${enc(id)}/period/${from}/${to}`),
  period: (from: string, to: string) => request<PeriodOverview>("GET", `/period/${from}/${to}`),
  updateEmployee: (id: string, update: EmployeeUpdate) => request<unknown>("PATCH", `/employees/${enc(id)}`, update),
  updateEmployees: (updates: { id: string; update: EmployeeUpdate }[]) =>
    request<{ updated: number }>("POST", "/employees/bulk", { updates }),
  saveDay: (id: string, date: string, body: Adjustment) => request<{ ok: true }>("PUT", `/employees/${enc(id)}/days/${date}`, body),
  addLeave: (id: string, body: { from: string; to: string; excuse: Excuse; note: string }) =>
    request<{ days: number }>("POST", `/employees/${enc(id)}/leave`, body),

  imports: () => request<ImportRecord[]>("GET", "/imports"),
  importTimecard: (body: { fileName: string; from: string; to: string; rows: TimecardRow[] }) =>
    request<ImportResult>("POST", "/imports", body),
  deleteImport: (id: number) => request<ImportDeleted>("DELETE", `/imports/${id}`),

  months: () => request<MonthListItem[]>("GET", "/months"),
  month: (month: string) => request<MonthOverview>("GET", `/months/${month}`),
  monthReview: (month: string) => request<MonthReview>("GET", `/months/${month}/review`),
  coverMonth: (month: string) => request<{ employees: number }>("POST", `/months/${month}/whole`),
  employeeMonth: (month: string, id: string) => request<EmployeeMonthReport>("GET", `/months/${month}/employees/${enc(id)}`),
  lockMonth: (month: string) => request<unknown>("POST", `/months/${month}/lock`),
  unlockMonth: (month: string) => request<unknown>("DELETE", `/months/${month}/lock`),

  users: () => request<User[]>("GET", "/users"),
  createUser: (body: { username: string; displayName: string; password: string; role: Role }) =>
    request<User>("POST", "/users", body),
  updateUser: (id: number, body: Partial<{ displayName: string; role: Role; active: boolean; password: string }>) =>
    request<User>("PATCH", `/users/${id}`, body),

  audit: () => request<AuditEntry[]>("GET", "/audit"),
};
