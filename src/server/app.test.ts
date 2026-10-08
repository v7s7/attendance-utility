import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TimecardRow } from "../core/timecard.ts";
import { buildApp } from "./app.ts";
import { openDatabase, type Db } from "./db/database.ts";
import { createUser } from "./store/users.ts";

let db: Db;
let app: FastifyInstance;
let cookie = "";

beforeEach(async () => {
  db = openDatabase(":memory:");
  app = await buildApp(db);
  cookie = "";
});

afterEach(async () => {
  await app.close();
  db.close();
});

async function call(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, body?: object) {
  const res: LightMyRequestResponse = await app.inject({ method, url, payload: body, headers: cookie ? { cookie } : {} });
  const set = res.cookies.find((c) => c.name === "au_session");
  if (set) cookie = `au_session=${set.value}`;
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
}

// IT creates the first administrator on the server (npm run create-user), then signs in
async function setupAdmin() {
  await createUser(db, { username: "admin", displayName: "IT Admin", password: "secret-pass", role: "admin" });
  return call("POST", "/api/auth/login", { username: "admin", password: "secret-pass" });
}

// September 2026: one employee, a late day, an early day and a missing OUT
const rows: TimecardRow[] = [
  { employeeId: "010101010", name: "SAMPLE", department: "IT", date: "2026-09-13", times: ["08:30:00", "15:15:00"], invalid: [] },
  { employeeId: "010101010", name: "SAMPLE", department: "IT", date: "2026-09-14", times: ["07:00:00", "14:00:00"], invalid: [] },
  { employeeId: "010101010", name: "SAMPLE", department: "IT", date: "2026-09-15", times: ["07:10:00"], invalid: [] },
];
const importSeptember = () =>
  call("POST", "/api/imports", { fileName: "Time Card.csv", from: "2026-09-13", to: "2026-09-15", rows });

describe("sign-in", () => {
  it("has no sign-up: only accounts created by IT can sign in", async () => {
    expect((await call("GET", "/api/auth/status")).body).toEqual({ user: null });
    const signUp = await call("POST", "/api/auth/setup", { username: "x", displayName: "x", password: "whatever-1" });
    expect(signUp.status).toBe(404);

    const login = await setupAdmin();
    expect([login.status, login.body.user.role]).toEqual([200, "admin"]);
    expect((await call("GET", "/api/auth/status")).body.user.username).toBe("admin");
  });

  it("protects the API and rejects a wrong password", async () => {
    await setupAdmin();
    cookie = "";
    expect((await call("GET", "/api/employees")).status).toBe(401);
    expect((await call("POST", "/api/auth/login", { username: "admin", password: "nope-nope" })).body.error).toBe("login_failed");
    expect((await call("POST", "/api/auth/login", { username: "ADMIN", password: "secret-pass" })).status).toBe(200);
    expect((await call("GET", "/api/employees")).status).toBe(200);
  });

  it("lets HR users work but keeps admin pages to admins", async () => {
    await setupAdmin();
    await call("POST", "/api/users", { username: "hr1", displayName: "HR One", password: "hr-password", role: "hr" });
    await call("POST", "/api/auth/logout");
    await call("POST", "/api/auth/login", { username: "hr1", password: "hr-password" });
    expect((await importSeptember()).status).toBe(200);
    expect((await call("GET", "/api/users")).status).toBe(403);
    expect((await call("POST", "/api/months/2026-09/lock")).status).toBe(403);
    expect((await call("GET", "/api/backup")).status).toBe(403);
  });

  it("never removes the last admin", async () => {
    const { body } = await setupAdmin();
    expect((await call("PATCH", `/api/users/${body.user.id}`, { role: "hr" })).body.error).toBe("last_admin");
  });
});

describe("monthly allowance and whole months", () => {
  beforeEach(async () => {
    await setupAdmin();
  });

  it("forgives the first 7:15 of lateness each month by default", async () => {
    expect((await call("GET", "/api/settings")).body.rules.allowanceHours).toBe(7.25);
    await importSeptember();
    const { summary } = (await call("GET", "/api/months/2026-09")).body.rows[0];
    expect(summary).toMatchObject({ latenessMin: 45, allowanceMin: 45, deductibleMin: 0 });
  });

  it("counts working days without a punch as absent once HR confirms the whole month", async () => {
    await importSeptember();
    // Before: only the 13th to the 15th were imported; the other working days have no data
    const before = (await call("GET", "/api/months/2026-09")).body;
    expect(before.missingDays.slice(0, 9)).toEqual([
      "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-06", "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-16",
    ]);
    expect(before.missingDays).toHaveLength(8 + 11);

    expect((await call("POST", "/api/months/2026-09/whole")).body).toEqual({ employees: 1 });
    const after = (await call("GET", "/api/months/2026-09")).body;
    expect(after.missingDays).toEqual([]);
    // Eight working days before the 13th and every working day after the 15th; never Fridays or Saturdays
    const report = (await call("GET", "/api/months/2026-09/employees/010101010")).body;
    const absent = report.days.filter((d: { status: string }) => d.status === "ABSENT").map((d: { weekday: number }) => d.weekday);
    expect(absent).toHaveLength(8 + 11);
    expect(absent.filter((w: number) => w === 5 || w === 6)).toEqual([]);
  });
});

describe("absence decisions", () => {
  beforeEach(async () => {
    await setupAdmin();
  });

  it("lets HR decide each absent day, and prices salary absences apart from lateness", async () => {
    await importSeptember();
    await call("POST", "/api/months/2026-09/whole");
    await call("PATCH", "/api/employees/010101010", { wage: { mode: "table", scale: "general", grade: 5, step: 3 } });
    const decide = (date: string, body: object) =>
      call("PUT", `/api/employees/010101010/days/${date}`, { inTime: null, outTime: null, excuse: null, note: "", ...body });

    await decide("2026-09-01", { excuse: "sick" });
    await decide("2026-09-02", { excuse: "annual" });
    expect((await decide("2026-09-03", { absence: "salary" })).status).toBe(200);

    const report = (await call("GET", "/api/months/2026-09/employees/010101010")).body;
    expect(report.days.find((d: { date: string }) => d.date === "2026-09-03")).toMatchObject({ status: "ABSENT", absence: "salary" });
    // The 3rd is a Thursday: 7:00 at 2.590 an hour. The 45 minutes of lateness stay within the allowance
    expect(report.summary).toMatchObject({ sickDays: 1, annualDays: 1, salaryAbsenceDays: 1, deductAbsenceMin: 420, latenessFils: 0, absenceFils: 18130 });
    expect(report.annualLeaveYear).toBe(1);

    // A wrong decision is rejected
    expect((await decide("2026-09-06", { absence: "bonus" })).status).toBe(400);
  });
});

describe("attendance", () => {
  beforeEach(async () => {
    await setupAdmin();
    // Deduct from the first minute, so the small test month shows a deduction
    const { rules } = (await call("GET", "/api/settings")).body;
    await call("PUT", "/api/settings", { rules: { ...rules, allowanceHours: 0 } });
  });

  it("imports a Time Card file and builds the month", async () => {
    const result = await importSeptember();
    expect(result.body).toMatchObject({ employees: 1, newEmployees: 1, punchesAdded: 5, punchesExisting: 0 });

    // Importing the same file again adds nothing
    expect((await importSeptember()).body).toMatchObject({ newEmployees: 0, punchesAdded: 0, punchesExisting: 5 });

    const months = await call("GET", "/api/months");
    expect(months.body.map((m: { month: string }) => m.month)).toEqual(["2026-09"]);

    // A file from another month adds only that month, not the empty months in between
    const may = [{ ...rows[0], date: "2026-05-10" }];
    await call("POST", "/api/imports", { fileName: "May.csv", from: "2026-05-10", to: "2026-05-10", rows: may });
    expect((await call("GET", "/api/months")).body.map((m: { month: string }) => m.month)).toEqual(["2026-09", "2026-05"]);

    const overview = await call("GET", "/api/months/2026-09");
    expect(overview.body.rows).toHaveLength(1);
    expect(overview.body.rows[0].summary).toMatchObject({ lateMin: 30, earlyMin: 15, deductibleMin: 45, needsReview: 1, partial: true });
  });

  it("applies HR's edits, wages and leave", async () => {
    await importSeptember();
    await call("PATCH", "/api/employees/010101010", { fullName: "Test Employee", wage: { mode: "table", scale: "general", grade: 5, step: 3 } });
    await call("PUT", "/api/employees/010101010/days/2026-09-15", { inTime: null, outTime: "14:30", excuse: null, note: "manual register" });
    const leave = await call("POST", "/api/employees/010101010/leave", { from: "2026-09-16", to: "2026-09-20", excuse: "annual", note: "" });
    expect(leave.body.days).toBe(3); // 16, 17 and 20; the 18th and 19th are the weekend

    const report = await call("GET", "/api/months/2026-09/employees/010101010");
    const day15 = report.body.days.find((d: { date: string }) => d.date === "2026-09-15");
    // 07:10 to 14:30 is 7h 20m, above the 7h 15m required
    expect([day15.status, day15.outTime, day15.outManual]).toEqual(["OK", "14:30", true]);
    expect(report.body.employee.name).toBe("Test Employee");
    expect(report.body.summary).toMatchObject({ annualDays: 3, needsReview: 0, rate: 2.59, deductibleMin: 45 });
    expect(report.body.summary.deductionFils).toBe(1943); // 45 min x 2.590 BHD = 1.9425
  });

  it("reports several months for one employee and for everyone, each month on its own", async () => {
    await importSeptember();
    const august = rows.map((r) => ({ ...r, date: r.date.replace("2026-09-1", "2026-08-1") }));
    await call("POST", "/api/imports", { fileName: "August.csv", from: "2026-08-13", to: "2026-08-15", rows: august });

    const person = (await call("GET", "/api/employees/010101010/period/2026-07/2026-09")).body;
    expect(person.months.map((m: { month: string }) => m.month)).toEqual(["2026-08", "2026-09"]);
    expect(person.totals.months).toBe(2);
    expect(person.totals.lateMin).toBe(person.months[0].summary.lateMin + person.months[1].summary.lateMin);

    const everyone = (await call("GET", "/api/period/2026-08/2026-09")).body;
    expect([everyone.months, everyone.rows.length, everyone.rows[0].totals.deductibleMin]).toEqual([["2026-08", "2026-09"], 1, person.totals.deductibleMin]);

    expect((await call("GET", "/api/period/2026-09/2026-08")).status).toBe(400);
  });

  it("lists the months an employee has data for, newest first", async () => {
    await importSeptember();
    await call("PUT", "/api/employees/010101010/days/2026-08-20", { inTime: null, outTime: null, excuse: "annual", note: "" });
    expect((await call("GET", "/api/employees/010101010/months")).body).toEqual(["2026-09", "2026-08"]);
    expect((await call("GET", "/api/employees/nobody/months")).status).toBe(404);
  });

  it("lists the days to review across employees", async () => {
    await importSeptember();
    const review = await call("GET", "/api/months/2026-09/review");
    expect(review.body.items.map((i: { employee: { id: string }; day: { date: string; status: string } }) => [i.employee.id, i.day.date, i.day.status])).toEqual([
      ["010101010", "2026-09-15", "INCOMPLETE"],
    ]);
  });

  it("updates many employees from the sheet at once, or none", async () => {
    await importSeptember();
    const wage = { mode: "table", scale: "general", grade: 5, step: 3 };
    const res = await call("POST", "/api/employees/bulk", { updates: [{ id: "010101010", update: { fullName: "Test Employee", wage } }] });
    expect(res.body).toEqual({ updated: 1 });
    expect((await call("GET", "/api/employees")).body[0]).toMatchObject({ name: "Test Employee", rate: 2.59 });

    const bad = await call("POST", "/api/employees/bulk", {
      updates: [
        { id: "010101010", update: { fullName: "Changed" } },
        { id: "nobody", update: { fullName: "Nobody" } },
      ],
    });
    expect([bad.status, bad.body.error]).toEqual([404, "employee_not_found"]);
    expect((await call("GET", "/api/employees")).body[0].name).toBe("Test Employee");
  });

  it("lets HR set a holiday over several days for every employee, but not in a locked month", async () => {
    await importSeptember();
    await call("POST", "/api/users", { username: "hr1", displayName: "HR One", password: "hr-password", role: "hr" });
    await call("POST", "/api/auth/logout");
    await call("POST", "/api/auth/login", { username: "hr1", password: "hr-password" });

    expect((await call("POST", "/api/holidays", { from: "2026-09-14", to: "2026-09-15", name: "Test Eid" })).body).toEqual({ days: 2 });
    const report = await call("GET", "/api/months/2026-09/employees/010101010");
    const days = report.body.days.filter((d: { date: string }) => d.date === "2026-09-14" || d.date === "2026-09-15");
    expect(days.map((d: { status: string; holidayName: string }) => [d.status, d.holidayName])).toEqual([
      ["HOLIDAY", "Test Eid"],
      ["HOLIDAY", "Test Eid"],
    ]);
    // The early leave on the 14th and the missing punch on the 15th no longer count
    expect(report.body.summary).toMatchObject({ lateMin: 30, earlyMin: 0, incompleteDays: 0 });

    expect((await call("DELETE", "/api/holidays", { from: "2026-09-15", to: "2026-09-15" })).body).toEqual({ days: 1 });
    expect((await call("GET", "/api/holidays")).body).toEqual([{ date: "2026-09-14", name: "Test Eid" }]);

    await call("POST", "/api/auth/logout");
    await call("POST", "/api/auth/login", { username: "admin", password: "secret-pass" });
    await call("POST", "/api/months/2026-09/lock");
    const locked = await call("POST", "/api/holidays", { from: "2026-09-30", to: "2026-10-01", name: "Late" });
    expect([locked.status, locked.body.error]).toEqual([409, "month_locked"]);
  });

  it("suggests a holiday when almost nobody punched on a working day", async () => {
    const staff = ["100000001", "100000002", "100000003"].flatMap((id) =>
      ["2026-09-13", "2026-09-15"].map((date) => ({ employeeId: id, name: "X", department: "IT", date, times: ["07:00:00", "14:30:00"], invalid: [] })),
    );
    await call("POST", "/api/imports", { fileName: "Time Card.csv", from: "2026-09-13", to: "2026-09-15", rows: staff });
    expect((await call("GET", "/api/months/2026-09")).body.possibleHolidays).toEqual([{ date: "2026-09-14", weekday: 1, absent: 3, total: 3 }]);

    await call("POST", "/api/holidays", { from: "2026-09-14", to: "2026-09-14", name: "Test" });
    expect((await call("GET", "/api/months/2026-09")).body.possibleHolidays).toEqual([]);
  });

  it("freezes a locked month and refuses changes to it", async () => {
    await importSeptember();
    expect((await call("POST", "/api/months/2026-09/lock")).status).toBe(200);

    expect((await call("PUT", "/api/employees/010101010/days/2026-09-15", { inTime: null, outTime: "14:30", excuse: null, note: "" })).body.error).toBe("month_locked");
    expect((await importSeptember()).body.error).toBe("month_locked");

    // Changing the rules afterwards does not change the approved numbers
    const settings = (await call("GET", "/api/settings")).body;
    await call("PUT", "/api/settings", { rules: { ...settings.rules, deductEarlyLeave: false } });
    const overview = await call("GET", "/api/months/2026-09");
    expect(overview.body.locked.month).toBe("2026-09");
    expect(overview.body.rows[0].summary.deductibleMin).toBe(45);

    await call("DELETE", "/api/months/2026-09/lock");
    expect((await call("GET", "/api/months/2026-09")).body.rows[0].summary.deductibleMin).toBe(30);
  });

  it("rejects bad input with a clear error", async () => {
    await importSeptember();
    const bad = await call("PUT", "/api/employees/010101010/days/2026-02-31", { inTime: "25:00", outTime: null, excuse: null, note: "" });
    expect([bad.status, bad.body.error]).toEqual([400, "invalid_input"]);
  });

  it("lets an admin download a copy of the database", async () => {
    await importSeptember();
    const res = await app.inject({ method: "GET", url: "/api/backup", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(/attachment; filename="attendance-\d{4}-\d{2}-\d{2}-\d{4}\.db"/);
    expect(res.rawPayload.subarray(0, 15).toString()).toBe("SQLite format 3");
  });

  it("lets HR delete a wrong import: its punches and the employees only it added go", async () => {
    await call("POST", "/api/users", { username: "hr1", displayName: "HR One", password: "hr-password", role: "hr" });
    await call("POST", "/api/auth/logout");
    await call("POST", "/api/auth/login", { username: "hr1", password: "hr-password" });

    // A file read wrongly: the name was taken as the ID
    const wrong = rows.map((r) => ({ ...r, employeeId: "SAMPLE" }));
    const bad = (await call("POST", "/api/imports", { fileName: "Wrong.csv", from: "2026-09-13", to: "2026-09-15", rows: wrong })).body;
    await importSeptember();
    expect((await call("GET", "/api/employees")).body).toHaveLength(2);

    expect((await call("DELETE", `/api/imports/${bad.importId}`)).body).toEqual({ punchesRemoved: 5, employeesRemoved: 1 });
    expect((await call("GET", "/api/employees")).body.map((e: { id: string }) => e.id)).toEqual(["010101010"]);
    expect((await call("GET", "/api/imports")).body.map((i: { fileName: string }) => i.fileName)).toEqual(["Time Card.csv"]);
    expect((await call("GET", "/api/months/2026-09")).body.rows[0].summary).toMatchObject({ lateMin: 30, earlyMin: 15 });
    expect((await call("DELETE", `/api/imports/${bad.importId}`)).status).toBe(404);
  });

  it("keeps the punches another import also had, HR's records and the employees HR filled in", async () => {
    const first = (await importSeptember()).body;
    const longer = [...rows, { ...rows[1], date: "2026-09-16" }];
    await call("POST", "/api/imports", { fileName: "Again.csv", from: "2026-09-13", to: "2026-09-16", rows: longer });
    await call("PATCH", "/api/employees/010101010", { fullName: "Test Employee" });
    await call("PUT", "/api/employees/010101010/days/2026-09-02", { inTime: null, outTime: null, excuse: "sick", note: "" });

    expect((await call("DELETE", `/api/imports/${first.importId}`)).body).toEqual({ punchesRemoved: 0, employeesRemoved: 0 });
    const report = (await call("GET", "/api/months/2026-09/employees/010101010")).body;
    const day = (date: string) => report.days.find((d: { date: string }) => d.date === date);
    expect([day("2026-09-13").inTime, day("2026-09-16").inTime, day("2026-09-02").excuse]).toEqual(["08:30:00", "07:00:00", "sick"]);

    // The last import goes too: the punches go, the employee HR named stays
    const [last] = (await call("GET", "/api/imports")).body;
    expect((await call("DELETE", `/api/imports/${last.id}`)).body).toEqual({ punchesRemoved: 7, employeesRemoved: 0 });
    expect((await call("GET", "/api/employees")).body[0].name).toBe("Test Employee");
  });

  it("doesn't delete an import in an approved month", async () => {
    const { importId } = (await importSeptember()).body;
    await call("POST", "/api/months/2026-09/lock");
    const res = await call("DELETE", `/api/imports/${importId}`);
    expect([res.status, res.body.error]).toEqual([409, "month_locked"]);
  });

  it("matches an ID that lost its leading zero in Excel to the employee already known", async () => {
    await importSeptember();
    const excel = [{ ...rows[0], employeeId: "10101010", date: "2026-09-16" }];
    const res = await call("POST", "/api/imports", { fileName: "Saved by Excel.csv", from: "2026-09-16", to: "2026-09-16", rows: excel });
    expect(res.body).toMatchObject({ employees: 1, newEmployees: 0, punchesAdded: 2 });
    expect((await call("GET", "/api/employees")).body.map((e: { id: string }) => e.id)).toEqual(["010101010"]);
  });

  it("records who changed what", async () => {
    await importSeptember();
    const audit = await call("GET", "/api/audit");
    expect(audit.body.map((a: { action: string }) => a.action)).toEqual(["import.create", "settings.update", "auth.login"]);
  });
});
