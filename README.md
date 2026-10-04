# Attendance & Deductions · نظام الحضور والخصومات

An HR web app for the attendance exports from the ZKTeco BioTime system. HR imports the
**Time Card** CSV files, reviews each employee's month, fixes forgotten punches and records
leave, and gets the lateness deduction from the CSB hourly wage tables. Finished months are
locked so the approved numbers never change.

Arabic by default, with English available. One server; every HR user shares the same data
through the browser.

## Start it

Needs Node.js 20 or newer (24 recommended).

```bash
npm install
npm start
```

Then open http://localhost:8090 (other PCs use the server's address, e.g.
http://10.27.16.115:8090). `npm start` builds the app and starts the server. Stop it with Ctrl+C.

## Accounts

There is no sign-up page; everyone sees **Sign in**. On a new server, IT creates the first
administrator once:

```bash
npm run create-user -- <username> <password> <display name>
```

That administrator then adds HR users (and other administrators) from the **Users** page,
where they can also reset passwords or deactivate accounts. Add `--hr` to the command to
create an HR user from the server instead.

## Where the data is

- The database is one file inside the app folder: **`data\attendance.db`**. It is created
  on the first start.
- A copy is saved automatically every day in **`data\backups`**
  (`attendance-2026-10-04-1206.db`, the newest 30 are kept). Run `npm run backup` for one now.
- Administrators can also download a copy from **Settings → Backups**.
- To restore: stop the app, copy a backup over `data\attendance.db`, start it again.
- Forgot a password: an administrator resets it from **Users**, or on the server:
  `npm run reset-password -- <username> <new password>`.

Optional settings (port, file locations) go in `.env`; see `.env.example`.

## Update

```bash
git pull
npm install
npm start
```

The database is never touched by updates; new versions upgrade it automatically on start.

## What it does

- **Import** one or more Time Card exports at once. Repeated punches are ignored, so
  importing the same file twice is safe. The period is the whole month by default, since
  BioTime leaves days without punches out of the file; a month imported with a shorter
  period can be completed later with **Count as absent** on the month page.
- **Reads punches carefully**: sorts them, merges double taps, and decides whether a lone
  punch is IN or OUT. Every guess is shown next to the day so HR can check it.
- **Work schedules** per employee:
  - *Flexible*: counting starts at 07:00, late after 08:00, 7:15 required (7:00 on Thursday)
  - *Fixed*: e.g. 07:00–14:15; late after the start, early leave before the end
  - *Hours only*: the actual time from first to last punch against the required hours
- **Staff first**: the app opens on the employees; a person's page shows one month, or
  **several months** added up (each month keeps its own allowance), and the same for everyone
  on the Months page. Print and Excel work for both. After an import the report opens directly.
- **Approving a month** follows a checklist on the month page: data complete, days reviewed,
  wages set, then lock.
- **Review page**: every missing punch and absence of the month, for all employees, on one
  page. HR types the time from the manual register (`715` → 07:15, `230` after a morning IN
  → 14:30, Arabic digits work) or picks an excuse, and Enter saves and moves to the next.
- **Public holidays** (HR or administrators): one day or a range such as Eid, applied to every
  employee, report and print. The fixed ones (New Year, Labour Day, National Day) take one
  click, and a month warns about a working day when almost nobody punched.
- **HR records**: times from the manual register, sick leave in one click, leave over a
  date range, personal permissions (with the monthly limit), official tasks.
- **Employee sheet**: download all employees as Excel, fill in full names, schedules and
  wage table/grade/step, upload it, check the changes, save. Empty cells change nothing.
- **Deduction**: late arrival + early leave × the hourly wage for the employee's scale,
  grade and step (or a typed rate), rounded to the fils.
- **Month locking** freezes the report as approved until an administrator unlocks it.
- **Printing**: an A4 statement per employee (full, or notes only) and a department
  deduction sheet for payroll, with signature lines. **Excel export** of the month.
- **Users and history**: HR and administrator roles, and a log of every change.

### How a day is counted

| Schedule | Counted time | Late | Early leave |
|---|---|---|---|
| Flexible (07:00, latest 08:00, 7:15) | 07:00 → 15:15 (Thu 15:00) | IN after 08:00 | the rest of the shortage |
| Fixed (07:00, 7:15) | 07:00 → 14:15 (Thu 14:00) | IN after 07:00 | OUT before 14:15 |
| Hours only (7:15) | actual IN → OUT | – | – (the shortage is "short hours") |

Time outside the counted window is ignored, and extra time on one day never makes up for
another day (CSB Instruction 1/2023). The first **7:15** of lateness and early leave in a month
is not deducted; only the time above it is. Working days without any punch are absences;
Fridays, Saturdays and public holidays never are. HR decides each absence on the review page:
**sick leave**, **from the annual leave balance**, or **from the salary**. An absence from the
salary is priced on its own (the day's hours × the same hourly wage) and the allowance never
covers it; the statement shows the lateness and absence deductions separately. All rules can be changed under **Settings**.

## Development

```bash
npm run dev     # API on 8090 and the web app with live reload on http://localhost:5173
npm run check   # type-check, lint and tests (tests need Node 22+)
```

```
src/
  core/      rules engine shared by server and web: punches, schedules, monthly report,
             wage tables, Time Card reader, API types (with tests)
  server/    Fastify API, SQLite database (better-sqlite3), sign-in, imports, reports, backups
  web/       React app: pages, dialogs, print sheets, Arabic/English text
```

Database changes go in `src/server/db/migrations.ts` as a new migration; they run
automatically on start. The hourly wage tables in `src/core/wageTables.ts` come from the CSB
calculation tables dated 1 August 2011.
