import { useMemo, useState } from "react";
import EmployeeReport from "../components/EmployeeReport";
import Overview from "../components/Overview";
import SettingsPanel from "../components/SettingsPanel";
import UploadDropzone from "../components/UploadDropzone";
import { LangContext, translate } from "../i18n";
import { buildReport, collectPunches, todayStr } from "../utils/calc";
import { asText, downloadCsv } from "../utils/exportCsv";
import { dayLabel, formatDuration, formatHours, formatRate, monthLabel } from "../utils/format";
import { useStoredState } from "../utils/storage";
import { DEFAULT_SETTINGS, dayWindow, mergeSettings, minToHm } from "../utils/timeRules";

// The latest month that has already ended, so HR lands on the month they are closing
function defaultMonth(months, today) {
  const finished = months.filter((m) => m < today.slice(0, 7));
  return finished.length ? finished[finished.length - 1] : months[months.length - 1];
}

export default function Home() {
  const [lang, setLang] = useStoredState("au.lang", "ar");
  const [settings, setSettings] = useStoredState("au.settings", DEFAULT_SETTINGS, mergeSettings);
  const [profiles, setProfiles] = useStoredState("au.profiles", {});
  const [edits, setEdits] = useStoredState("au.edits", {});
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState(null);
  const [month, setMonth] = useState("");
  const [employeeId, setEmployeeId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  const t = (key, vars) => translate(lang, key, vars);
  const today = todayStr();

  const report = useMemo(
    () => (data && period ? buildReport(data, { settings, profiles, edits, period, today }) : null),
    [data, period, settings, profiles, edits, today]
  );

  const months = report ? report.months : [];
  const activeMonth = months.includes(month) ? month : months.length ? defaultMonth(months, today) : "";
  const employees = report ? report.employees : [];
  const selected = employees.length === 1 ? employees[0] : employees.find((e) => e.id === employeeId) || null;

  function handleLoaded(rows, fileCount) {
    const collected = collectPunches(rows);
    setData({ ...collected, fileCount });
    setPeriod({ from: collected.from, to: collected.to });
    setMonth("");
    setEmployeeId(null);
  }

  function updateProfile(id, patch) {
    setProfiles((all) => ({ ...all, [id]: { ...all[id], ...patch } }));
  }

  function saveEdit(id, date, edit) {
    setEdits((all) => {
      const mine = { ...(all[id] || {}) };
      if (edit) mine[date] = edit;
      else delete mine[date];
      return { ...all, [id]: mine };
    });
  }

  function exportMonth() {
    const header = [
      t("col.month"),
      t("col.cpr"),
      t("col.name"),
      t("col.department"),
      t("col.workingDays"),
      t("col.absent"),
      t("col.review"),
      t("col.excused"),
      t("col.late"),
      t("col.early"),
      t("col.deductible"),
      t("col.deductibleHours"),
      t("col.rate"),
      t("col.deduction") + " (" + t("unit.bhd") + ")",
      t("col.state"),
    ];
    const rows = employees.map((e) => {
      const m = e.months[activeMonth];
      const state = m.rate === null ? t("state.noWage") : m.needsReview ? t("state.review", { n: m.needsReview }) : t("state.ready");
      return [
        activeMonth,
        asText(e.id),
        e.name,
        e.department,
        m.workingDays,
        m.absentDays,
        m.needsReview,
        m.excusedDays,
        formatDuration(m.lateMin, lang),
        formatDuration(m.earlyMin, lang),
        formatDuration(m.deductibleMin, lang),
        formatHours(m.deductibleMin),
        formatRate(m.rate),
        m.deductionFils === null ? "" : (m.deductionFils / 1000).toFixed(3),
        state + (m.partial ? " · " + t("col.partial") : ""),
      ];
    });
    downloadCsv("deductions-" + activeMonth + ".csv", [header, ...rows]);
  }

  const sun = dayWindow("2026-01-04", settings);
  const thu = dayWindow("2026-01-08", settings);
  const rulesLine = t("app.rules", {
    start: minToHm(sun.start),
    end: minToHm(sun.end),
    endThu: minToHm(thu.end),
    late: minToHm(sun.latestStart),
    req: minToHm(sun.required),
    reqThu: minToHm(thu.required),
    weekend: settings.weekendDays.map((d) => dayLabel(d, lang)).join(" / "),
  });

  return (
    <LangContext.Provider value={lang}>
      <div className="page" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
        <div className="card">
          <div className="headerRow">
            <div>
              <h1 className="title">{t("app.title")}</h1>
              <p className="subtext">{t("app.subtitle")}</p>
              <p className="rulesLine">{rulesLine}</p>
            </div>
            <div className="btnRow noPrint">
              <button type="button" className="btn btnGhost" onClick={() => setLang(lang === "ar" ? "en" : "ar")}>
                {t("lang.switch")}
              </button>
              <button type="button" className="btn" onClick={() => setShowSettings(!showSettings)}>
                {showSettings ? t("settings.close") : t("settings.open")}
              </button>
            </div>
          </div>

          {showSettings ? <SettingsPanel settings={settings} onChange={setSettings} /> : null}

          <div className="section">
            <UploadDropzone
              onLoaded={handleLoaded}
              loadedText={data ? t("upload.loaded", { files: data.fileCount, employees: data.employees.length }) : ""}
            />
          </div>

          {report ? (
            <div className="toolbar noPrint">
              <div className="periodRow">
                <span className="fieldLabel">{t("period.label")}</span>
                <label className="inline">
                  {t("period.from")}
                  <input
                    type="date"
                    className="input"
                    value={period.from}
                    onChange={(e) => e.target.value && setPeriod({ ...period, from: e.target.value })}
                  />
                </label>
                <label className="inline">
                  {t("period.to")}
                  <input
                    type="date"
                    className="input"
                    value={period.to}
                    onChange={(e) => e.target.value && setPeriod({ ...period, to: e.target.value })}
                  />
                </label>
                <span className="fieldHint">{t("period.hint")}</span>
              </div>
              <div className="chips">
                {months.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={"chip" + (m === activeMonth ? " chipActive" : "")}
                    onClick={() => setMonth(m)}
                  >
                    {monthLabel(m, lang)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {report && activeMonth ? (
            selected ? (
              <EmployeeReport
                key={selected.id}
                employee={selected}
                month={activeMonth}
                settings={settings}
                today={today}
                onBack={employees.length > 1 ? () => setEmployeeId(null) : null}
                onMonth={setMonth}
                onProfile={(patch) => updateProfile(selected.id, patch)}
                onSaveEdit={(date, edit) => saveEdit(selected.id, date, edit)}
              />
            ) : (
              <Overview report={report} month={activeMonth} onOpen={setEmployeeId} onExport={exportMonth} />
            )
          ) : null}

          {report && !activeMonth ? <div className="warnBox">{t("table.empty")}</div> : null}
        </div>
      </div>
    </LangContext.Provider>
  );
}
