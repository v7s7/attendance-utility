import { Fragment, useState } from "react";
import { EXCUSES, useLang, useT } from "../i18n";
import { dayLabel, formatBhd, formatDuration, formatHours, formatRate, monthLabel, shortTime } from "../utils/format";
import PrintFooter from "./PrintFooter";
import WagePicker from "./WagePicker";

function DayEditor({ day, onSave, onCancel }) {
  const t = useT();
  const [inTime, setInTime] = useState(day.inManual ? day.inTime : "");
  const [outTime, setOutTime] = useState(day.outManual ? day.outTime : "");
  const [excuse, setExcuse] = useState(day.excuse);
  const [note, setNote] = useState(day.note);

  function save() {
    const edit = {};
    if (inTime) edit.inTime = inTime;
    if (outTime) edit.outTime = outTime;
    if (excuse) edit.excuse = excuse;
    if (note.trim()) edit.note = note.trim();
    onSave(Object.keys(edit).length ? edit : null);
  }

  return (
    <div className="dayEditor">
      <div className="editorGrid">
        <label className="field">
          <span className="fieldHint">{t("edit.in")}</span>
          <input type="time" className="input" value={inTime} onChange={(e) => setInTime(e.target.value)} />
          <span className="fieldHint" dir="ltr">
            {shortTime(day.deviceIn)}
          </span>
        </label>
        <label className="field">
          <span className="fieldHint">{t("edit.out")}</span>
          <input type="time" className="input" value={outTime} onChange={(e) => setOutTime(e.target.value)} />
          <span className="fieldHint" dir="ltr">
            {shortTime(day.deviceOut)}
          </span>
        </label>
        <label className="field">
          <span className="fieldHint">{t("edit.excuse")}</span>
          <select className="input" value={excuse} onChange={(e) => setExcuse(e.target.value)}>
            <option value="">{t("excuse.none")}</option>
            {EXCUSES.map((x) => (
              <option key={x} value={x}>
                {t("excuse." + x)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="fieldHint">{t("edit.note")}</span>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      <div className="fieldHint">{t("edit.hint")}</div>
      <div className="btnRow">
        <button type="button" className="btn" onClick={save}>
          {t("btn.save")}
        </button>
        {day.edited ? (
          <button type="button" className="btn btnGhost" onClick={() => onSave(null)}>
            {t("btn.clearEdit")}
          </button>
        ) : null}
        <button type="button" className="btn btnGhost" onClick={onCancel}>
          {t("btn.cancel")}
        </button>
      </div>
    </div>
  );
}

function dayNotes(d, t) {
  const parts = [];
  if (d.status === "INCOMPLETE" && d.reason) parts.push(t("reason." + d.reason));
  if (d.status === "EXCUSED") parts.push(t("excuse." + d.excuse));
  if (d.status === "HOLIDAY" && d.reason) parts.push(d.reason);
  for (const n of d.notes) parts.push(t("note." + n.code, n));
  if (d.inManual || d.outManual) parts.push(t("note.manual"));
  if (d.note) parts.push("«" + d.note + "»");
  return parts;
}

function Breakdown({ m, settings, lang, t }) {
  const lines = [];
  lines.push({ label: t("calc.late", { n: m.lateDays }), value: formatDuration(m.lateMin, lang) });
  if (settings.deductEarlyLeave) lines.push({ label: t("calc.early"), value: formatDuration(m.earlyMin, lang) });
  else lines.push({ label: t("calc.earlyOff"), value: formatDuration(m.earlyMin, lang), cls: "muted" });
  if (m.allowanceMin) lines.push({ label: t("calc.allowance"), value: "− " + formatDuration(m.allowanceMin, lang) });

  if (m.absentDays) {
    if (settings.absenceMode === "deduct") {
      lines.push({ label: t("calc.absence", { n: m.absentDays }), value: formatDuration(m.absenceMin, lang) });
    } else {
      lines.push({ label: t("calc.absenceListed", { n: m.absentDays }), value: "-", cls: "muted" });
    }
  }
  if (m.incompleteDays) {
    if (settings.incompleteMode === "deduct") {
      lines.push({ label: t("calc.incomplete", { n: m.incompleteDays }), value: formatDuration(m.incompleteMin, lang) });
    } else {
      lines.push({ label: t("calc.incompleteHeld", { n: m.incompleteDays }), value: "-", cls: "warnText" });
    }
  }
  if (m.excusedDays) lines.push({ label: t("calc.excused", { n: m.excusedDays }), value: "-", cls: "muted" });

  return (
    <div className="breakdown">
      {lines.map((l, i) => (
        <div key={i} className={"breakLine " + (l.cls || "")}>
          <span>{l.label}</span>
          <span>{l.value}</span>
        </div>
      ))}
      <div className="breakLine breakTotal">
        <span>{t("calc.deductible")}</span>
        <span>
          {formatDuration(m.deductibleMin, lang)} <span className="muted">({formatHours(m.deductibleMin)})</span>
        </span>
      </div>
      <div className="breakLine">
        <span>{t("calc.rate")}</span>
        <span>{m.rate === null ? t("state.noWage") : formatRate(m.rate) + " " + t("unit.bhd")}</span>
      </div>
      <div className="breakLine breakResult">
        <span>{t("calc.deduction")}</span>
        <span>{formatBhd(m.deductionFils, lang)}</span>
      </div>
    </div>
  );
}

export default function EmployeeReport({
  employee,
  month,
  settings,
  today,
  onBack,
  onMonth,
  onProfile,
  onSaveEdit,
}) {
  const t = useT();
  const lang = useLang();
  const [editing, setEditing] = useState(null);

  const m = employee.months[month];
  const days = employee.days.filter((d) => d.month === month);
  const final = m.rate !== null && !m.needsReview && month < today.slice(0, 7);

  const warnings = [];
  if (m.needsReview) warnings.push(t("warn.review", { n: m.needsReview }));
  if (m.permissionOver) {
    warnings.push(
      t("warn.permission", {
        count: m.permissionCount,
        time: formatDuration(m.permissionMin, lang),
        maxCount: settings.permissionLimitCount,
        maxTime: settings.permissionLimitTime,
      })
    );
  }
  if (m.partial && m.from) warnings.push(t("warn.partial", { from: m.from, to: m.to }));
  if (m.inProgressDays) warnings.push(t("warn.inProgress", { date: today }));

  return (
    <div className="section">
      {onBack ? (
        <button type="button" className="btn btnGhost noPrint" onClick={onBack}>
          {t("btn.back")}
        </button>
      ) : null}

      <div className="employeeCard">
        <div className="employeeMain">
          <div className="employeeName">{employee.name || "-"}</div>
          <div className="employeeMeta">
            <span>
              {t("col.cpr")}: <b dir="ltr">{employee.id || "-"}</b>
            </span>
            {employee.department ? (
              <span>
                {t("col.department")}: <b>{employee.department}</b>
              </span>
            ) : null}
          </div>
          <label className="field noPrint">
            <span className="fieldHint">{t("emp.fullName")}</span>
            <input
              className="input"
              value={employee.profile.fullName || ""}
              placeholder={employee.fileName}
              onChange={(e) => onProfile({ fullName: e.target.value })}
            />
            <span className="fieldHint">{t("emp.fullNameHint", { name: employee.fileName })}</span>
          </label>
        </div>
        <div className="noPrint">
          <WagePicker profile={employee.profile} onChange={onProfile} />
        </div>
      </div>

      <div className="calcCard">
        <div className="sectionHeader">
          <h2 className="sectionTitle">{t("calc.title", { month: monthLabel(month, lang) })}</h2>
          <div className="btnRow">
            <span className={final ? "badge badgeOK" : "badge badgeINCOMPLETE"}>
              {final ? t("calc.final") : t("calc.notFinal")}
            </span>
            <button type="button" className="btn btnGhost noPrint" onClick={() => window.print()}>
              {t("btn.print")}
            </button>
          </div>
        </div>
        <Breakdown m={m} settings={settings} lang={lang} t={t} />
        {warnings.map((w, i) => (
          <div key={i} className="warnBox">
            {w}
          </div>
        ))}
      </div>

      <h3 className="sectionTitle">{t("table.daily", { month: monthLabel(month, lang) })}</h3>
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>{t("col.date")}</th>
              <th>{t("col.day")}</th>
              <th>{t("col.in")}</th>
              <th>{t("col.out")}</th>
              <th>{t("col.worked")}</th>
              <th>{t("col.required")}</th>
              <th>{t("col.late")}</th>
              <th>{t("col.early")}</th>
              <th>{t("col.status")}</th>
              <th>{t("col.notes")}</th>
              <th className="noPrint" />
            </tr>
          </thead>
          <tbody>
            {days.length === 0 ? (
              <tr>
                <td colSpan={11} className="muted">
                  {t("table.empty")}
                </td>
              </tr>
            ) : null}
            {days.map((d) => {
              const counted = d.status === "OK" || d.status === "SHORT";
              return (
                <Fragment key={d.date}>
                  <tr className={"row row" + d.status}>
                    <td dir="ltr">
                      <b>{d.date}</b>
                    </td>
                    <td>{dayLabel(d.weekday, lang)}</td>
                    <td dir="ltr" className={d.inManual ? "manual" : ""}>
                      {shortTime(d.inTime)}
                    </td>
                    <td dir="ltr" className={d.outManual ? "manual" : ""}>
                      {shortTime(d.outTime)}
                    </td>
                    <td>{counted ? formatDuration(d.workedMin, lang) : "-"}</td>
                    <td>{d.status === "HOLIDAY" ? "-" : formatDuration(d.requiredMin, lang)}</td>
                    <td>{counted && d.lateMin ? formatDuration(d.lateMin, lang) : "-"}</td>
                    <td>{counted && d.earlyMin ? formatDuration(d.earlyMin, lang) : "-"}</td>
                    <td>
                      <span className={"badge badge" + d.status}>{t("status." + d.status)}</span>
                    </td>
                    <td className="notes">{dayNotes(d, t).join(" · ")}</td>
                    <td className="noPrint">
                      {d.status !== "HOLIDAY" ? (
                        <button
                          type="button"
                          className="linkBtn"
                          onClick={() => setEditing(editing === d.date ? null : d.date)}
                        >
                          {t("btn.edit")}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                  {editing === d.date ? (
                    <tr className="noPrint">
                      <td colSpan={11}>
                        <DayEditor
                          day={d}
                          onCancel={() => setEditing(null)}
                          onSave={(edit) => {
                            onSaveEdit(d.date, edit);
                            setEditing(null);
                          }}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <h3 className="sectionTitle noPrint">{t("table.monthly")}</h3>
      <div className="tableWrap noPrint">
        <table>
          <thead>
            <tr>
              <th>{t("col.month")}</th>
              <th>{t("col.workingDays")}</th>
              <th>{t("col.absent")}</th>
              <th>{t("col.review")}</th>
              <th>{t("col.excused")}</th>
              <th>{t("col.late")}</th>
              <th>{t("col.early")}</th>
              <th>{t("col.deductible")}</th>
              <th>{t("col.deduction")}</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(employee.months).map((x) => (
              <tr
                key={x.month}
                className={"clickRow" + (x.month === month ? " rowSelected" : "")}
                onClick={() => onMonth(x.month)}
              >
                <td>
                  <b>{monthLabel(x.month, lang)}</b>
                  {x.partial ? <div className="muted small">{t("col.partial")}</div> : null}
                </td>
                <td>{x.workingDays}</td>
                <td>{x.absentDays}</td>
                <td>{x.needsReview || "-"}</td>
                <td>{x.excusedDays || "-"}</td>
                <td>{formatDuration(x.lateMin, lang)}</td>
                <td>{formatDuration(x.earlyMin, lang)}</td>
                <td>
                  <b>{formatDuration(x.deductibleMin, lang)}</b>
                </td>
                <td>
                  <b>{formatBhd(x.deductionFils, lang)}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PrintFooter />
    </div>
  );
}
