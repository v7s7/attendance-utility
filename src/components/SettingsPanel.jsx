import { useState } from "react";
import { useLang, useT } from "../i18n";
import { dayLabel } from "../utils/format";
import { DEFAULT_SETTINGS, dayWindow, minToHm } from "../utils/timeRules";

const DURATION = /^\d{1,2}:[0-5]\d$/;

// Text box for an hours:minutes duration; only valid values reach the settings
function DurationInput({ value, onChange }) {
  const [text, setText] = useState(value);

  return (
    <input
      className={"input" + (DURATION.test(text) ? "" : " inputInvalid")}
      value={text}
      dir="ltr"
      placeholder="07:15"
      onChange={(e) => {
        setText(e.target.value);
        if (DURATION.test(e.target.value)) onChange(e.target.value);
      }}
    />
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="fieldLabel">{label}</span>
      {children}
      {hint ? <span className="fieldHint">{hint}</span> : null}
    </label>
  );
}

// Sample Sunday and Thursday used to preview the counted window
const SAMPLE_SUN = "2026-01-04";
const SAMPLE_THU = "2026-01-08";

export default function SettingsPanel({ settings, onChange }) {
  const t = useT();
  const lang = useLang();
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayName, setHolidayName] = useState("");
  // Bumped on reset so the duration boxes show the restored values
  const [resetCount, setResetCount] = useState(0);

  const set = (patch) => onChange({ ...settings, ...patch });

  function preview(date, dayIndex) {
    const w = dayWindow(date, settings);
    return t("settings.preview", {
      day: dayLabel(dayIndex, lang),
      start: minToHm(w.start),
      end: minToHm(w.end),
      late: minToHm(w.latestStart),
      req: minToHm(w.required),
    });
  }

  function toggleWeekend(day) {
    const has = settings.weekendDays.includes(day);
    set({ weekendDays: has ? settings.weekendDays.filter((d) => d !== day) : [...settings.weekendDays, day].sort() });
  }

  function addHoliday() {
    if (!holidayDate || settings.holidays.some((h) => h.date === holidayDate)) return;
    const holidays = [...settings.holidays, { date: holidayDate, name: holidayName.trim() }];
    holidays.sort((a, b) => a.date.localeCompare(b.date));
    set({ holidays });
    setHolidayDate("");
    setHolidayName("");
  }

  function reset() {
    if (!window.confirm(t("settings.resetConfirm"))) return;
    onChange(DEFAULT_SETTINGS);
    setResetCount((n) => n + 1);
  }

  return (
    <div className="settingsPanel noPrint">
      <div className="settingsHeader">
        <div>
          <div className="panelTitle">{t("settings.title")}</div>
          <div className="panelHint">{t("settings.saved")}</div>
        </div>
        <button type="button" className="btn btnGhost" onClick={reset}>
          {t("btn.reset")}
        </button>
      </div>

      <div className="settingsGrid">
        <section className="settingsSection">
          <h3 className="settingsTitle">{t("settings.hours")}</h3>
          <Field label={t("settings.earliestStart")} hint={t("settings.earliestStartHint")}>
            <input
              type="time"
              className="input"
              value={settings.earliestStart}
              onChange={(e) => e.target.value && set({ earliestStart: e.target.value })}
            />
          </Field>
          <Field label={t("settings.latestStart")} hint={t("settings.latestStartHint")}>
            <input
              type="time"
              className="input"
              value={settings.latestStart}
              onChange={(e) => e.target.value && set({ latestStart: e.target.value })}
            />
          </Field>
          <Field label={t("settings.requiredSunWed")} hint={t("settings.durationHint")}>
            <DurationInput key={resetCount} value={settings.requiredSunWed} onChange={(v) => set({ requiredSunWed: v })} />
          </Field>
          <Field label={t("settings.requiredThu")} hint={t("settings.durationHint")}>
            <DurationInput key={resetCount} value={settings.requiredThu} onChange={(v) => set({ requiredThu: v })} />
          </Field>
          <div className="fieldLabel">{t("settings.weekend")}</div>
          <div className="checkRow">
            {[0, 1, 2, 3, 4, 5, 6].map((d) => (
              <label key={d} className="check">
                <input type="checkbox" checked={settings.weekendDays.includes(d)} onChange={() => toggleWeekend(d)} />
                {dayLabel(d, lang)}
              </label>
            ))}
          </div>
          <div className="previewBox">
            <div>{preview(SAMPLE_SUN, 0)}</div>
            <div>{preview(SAMPLE_THU, 4)}</div>
          </div>
        </section>

        <section className="settingsSection">
          <h3 className="settingsTitle">{t("settings.deduction")}</h3>
          <label className="check checkBlock">
            <input
              type="checkbox"
              checked={settings.deductEarlyLeave}
              onChange={(e) => set({ deductEarlyLeave: e.target.checked })}
            />
            <span>
              <span className="fieldLabel">{t("settings.deductEarly")}</span>
              <span className="fieldHint">{t("settings.deductEarlyHint")}</span>
            </span>
          </label>
          <Field label={t("settings.allowance")} hint={t("settings.allowanceHint")}>
            <input
              type="number"
              min="0"
              step="0.5"
              className="input"
              value={settings.allowanceHours}
              onChange={(e) => set({ allowanceHours: Math.max(0, Number(e.target.value) || 0) })}
            />
          </Field>
          <Field label={t("settings.absence")}>
            <select className="input" value={settings.absenceMode} onChange={(e) => set({ absenceMode: e.target.value })}>
              <option value="list">{t("settings.absence.list")}</option>
              <option value="deduct">{t("settings.absence.deduct")}</option>
            </select>
          </Field>
          <Field label={t("settings.incomplete")}>
            <select
              className="input"
              value={settings.incompleteMode}
              onChange={(e) => set({ incompleteMode: e.target.value })}
            >
              <option value="hold">{t("settings.incomplete.hold")}</option>
              <option value="deduct">{t("settings.incomplete.deduct")}</option>
            </select>
          </Field>
        </section>

        <section className="settingsSection">
          <h3 className="settingsTitle">{t("settings.permissions")}</h3>
          <Field label={t("settings.permCount")}>
            <input
              type="number"
              min="0"
              className="input"
              value={settings.permissionLimitCount}
              onChange={(e) => set({ permissionLimitCount: Math.max(0, Number(e.target.value) || 0) })}
            />
          </Field>
          <Field label={t("settings.permTime")} hint={t("settings.permHint")}>
            <DurationInput key={resetCount} value={settings.permissionLimitTime} onChange={(v) => set({ permissionLimitTime: v })} />
          </Field>

          <h3 className="settingsTitle">{t("settings.smart")}</h3>
          <Field label={t("settings.dupWindow")} hint={t("settings.dupHint")}>
            <input
              type="number"
              min="0"
              max="120"
              className="input"
              value={settings.duplicateWindowMin}
              onChange={(e) => set({ duplicateWindowMin: Math.max(0, Number(e.target.value) || 0) })}
            />
          </Field>
        </section>

        <section className="settingsSection">
          <h3 className="settingsTitle">{t("settings.holidays")}</h3>
          <div className="fieldHint">{t("settings.holidaysHint")}</div>
          <div className="holidayAdd">
            <input type="date" className="input" value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} />
            <input
              className="input"
              placeholder={t("settings.holidayName")}
              value={holidayName}
              onChange={(e) => setHolidayName(e.target.value)}
            />
            <button type="button" className="btn" onClick={addHoliday} disabled={!holidayDate}>
              {t("btn.add")}
            </button>
          </div>
          <ul className="list">
            {settings.holidays.length === 0 ? (
              <li className="muted">{t("settings.noHolidays")}</li>
            ) : (
              settings.holidays.map((h) => (
                <li key={h.date} className="listItem">
                  <span>
                    <b dir="ltr">{h.date}</b> {h.name}
                  </span>
                  <button
                    type="button"
                    className="linkBtn"
                    onClick={() => set({ holidays: settings.holidays.filter((x) => x.date !== h.date) })}
                  >
                    {t("btn.remove")}
                  </button>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
