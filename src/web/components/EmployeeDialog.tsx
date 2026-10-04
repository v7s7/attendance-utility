import { useState } from "react";
import type { EmployeeView } from "../../core/api.ts";
import type { Schedule, WageProfile } from "../../core/types.ts";
import { WAGE_SCALES } from "../../core/wageTables.ts";
import { findScale, hourlyRate } from "../../core/wages.ts";
import { api } from "../api.ts";
import { errorText } from "../errors.ts";
import { rate } from "../format.ts";
import { useLang } from "../i18n/context.ts";
import { scheduleLines } from "./scheduleText.ts";
import { Alert } from "../ui/Alert.tsx";
import { Button } from "../ui/Button.tsx";
import { Dialog } from "../ui/Dialog.tsx";
import { Check, Field } from "../ui/Field.tsx";

interface EmployeeDialogProps {
  employee: EmployeeView | null;
  schedules: Schedule[];
  defaultScheduleId: number;
  onClose: () => void;
  onSaved: () => void;
}

export function EmployeeDialog({ employee, schedules, defaultScheduleId, onClose, onSaved }: EmployeeDialogProps) {
  const { t } = useLang();
  return (
    <Dialog open={employee !== null} onClose={onClose} title={t("employee.title")} description={employee?.id} size="lg">
      {employee ? (
        <EmployeeForm
          key={employee.id}
          employee={employee}
          schedules={schedules}
          defaultScheduleId={defaultScheduleId}
          onClose={onClose}
          onSaved={onSaved}
        />
      ) : null}
    </Dialog>
  );
}

function EmployeeForm({ employee, schedules, defaultScheduleId, onClose, onSaved }: EmployeeDialogProps & { employee: EmployeeView }) {
  const { t, lang } = useLang();
  const [fullName, setFullName] = useState(employee.fullName);
  const [employeeNo, setEmployeeNo] = useState(employee.employeeNo);
  const [department, setDepartment] = useState(employee.department);
  const [scheduleChoice, setScheduleChoice] = useState<number | null>(employee.scheduleChoice);
  const [active, setActive] = useState(employee.active);
  const [wage, setWage] = useState<WageProfile>(employee.wage);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const defaultSchedule = schedules.find((s) => s.id === defaultScheduleId);
  const chosenSchedule = schedules.find((s) => s.id === (scheduleChoice ?? defaultScheduleId));

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await api.updateEmployee(employee.id, { fullName, employeeNo, department, scheduleId: scheduleChoice, wage, active });
      onSaved();
      onClose();
    } catch (e) {
      setError(errorText(t, e));
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("employee.fullName")} hint={t("employee.fullNameHint", { name: employee.exportedName })} className="sm:col-span-2">
          <input className="input" value={fullName} maxLength={120} placeholder={employee.exportedName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label={t("employee.employeeNo")}>
          <input className="input" dir="ltr" value={employeeNo} maxLength={40} onChange={(e) => setEmployeeNo(e.target.value)} />
        </Field>
        <Field label={t("employee.department")}>
          <input className="input" value={department} maxLength={120} onChange={(e) => setDepartment(e.target.value)} />
        </Field>
        <Field label={t("employee.schedule")} className="sm:col-span-2">
          <select
            className="input"
            value={scheduleChoice ?? ""}
            onChange={(e) => setScheduleChoice(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">{t("employee.defaultSchedule", { name: defaultSchedule?.name ?? "" })}</option>
            {schedules.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        {chosenSchedule ? (
          <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600 sm:col-span-2">
            <p className="font-medium text-slate-800">{t(`schedule.kindHint.${chosenSchedule.kind}`)}</p>
            <ul className="mt-1">
              {scheduleLines(chosenSchedule, t, lang).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <WageFields wage={wage} onChange={setWage} />

      <Check label={t("employee.active")} hint={t("employee.activeHint")} checked={active} onChange={setActive} />

      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button type="submit" variant="primary" loading={busy}>
          {t("common.save")}
        </Button>
      </div>
    </form>
  );
}

/** Choose the hourly wage: a step in the CSB wage tables, or a rate typed in. */
function WageFields({ wage, onChange }: { wage: WageProfile; onChange: (w: WageProfile) => void }) {
  const { t, lang } = useLang();
  const scale = findScale(wage.scale);
  const grade = scale?.grades.find((g) => g.grade === wage.grade);
  const value = hourlyRate(wage);

  return (
    <fieldset className="rounded-lg border border-slate-200 p-4">
      <legend className="px-1 text-sm font-semibold text-slate-800">{t("wage.title")}</legend>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label={t("wage.source")}>
          <select
            className="input"
            value={wage.mode ?? ""}
            onChange={(e) => onChange(e.target.value ? { mode: e.target.value as "table" | "custom" } : {})}
          >
            <option value="">{t("wage.none")}</option>
            <option value="table">{t("wage.table")}</option>
            <option value="custom">{t("wage.custom")}</option>
          </select>
        </Field>

        {wage.mode === "table" ? (
          <>
            <Field label={t("wage.scale")}>
              <select className="input" value={wage.scale ?? ""} onChange={(e) => onChange({ mode: "table", scale: e.target.value || undefined })}>
                <option value="">{t("wage.choose")}</option>
                {WAGE_SCALES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {lang === "ar" ? s.ar : s.en}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("wage.grade")}>
              <select
                className="input"
                disabled={!scale}
                value={wage.grade ?? ""}
                onChange={(e) => onChange({ mode: "table", scale: wage.scale, grade: e.target.value ? Number(e.target.value) : undefined })}
              >
                <option value="">{t("wage.choose")}</option>
                {scale?.grades.map((g) => (
                  <option key={g.grade} value={g.grade}>
                    {g.grade}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("wage.step")}>
              <select
                className="input"
                disabled={!grade}
                value={wage.step ?? ""}
                onChange={(e) => onChange({ ...wage, step: e.target.value === "" ? undefined : Number(e.target.value) })}
              >
                <option value="">{t("wage.choose")}</option>
                {grade?.steps.map((v, i) =>
                  v === null ? null : (
                    <option key={i} value={i}>
                      {(i === 0 ? t("wage.minimum") : i) + " — " + rate(v)}
                    </option>
                  ),
                )}
              </select>
            </Field>
          </>
        ) : null}

        {wage.mode === "custom" ? (
          <Field label={t("wage.rate")}>
            <input
              type="number"
              className="input"
              dir="ltr"
              min="0"
              step="0.001"
              value={wage.rate ?? ""}
              onChange={(e) => onChange({ mode: "custom", rate: e.target.value === "" ? undefined : Number(e.target.value) })}
            />
          </Field>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className={value === null ? "text-slate-500" : "font-semibold text-teal-800"}>
          {value === null ? t("wage.none") : t("wage.result", { rate: rate(value) })}
        </span>
        {wage.mode === "table" ? <span className="text-xs text-slate-500">{t("wage.tablesNote")}</span> : null}
      </div>
    </fieldset>
  );
}
