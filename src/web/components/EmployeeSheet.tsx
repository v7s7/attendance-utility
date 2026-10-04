import { CircleCheck } from "lucide-react";
import { useState } from "react";
import { SHEET_TITLES, type SheetResult } from "../../core/employeeSheet.ts";
import type { Schedule, WageProfile } from "../../core/types.ts";
import { findScale, hourlyRate } from "../../core/wages.ts";
import { api } from "../api.ts";
import { errorText } from "../errors.ts";
import { rate } from "../format.ts";
import { useLang, type Lang, type Translate } from "../i18n/context.ts";
import { Alert } from "../ui/Alert.tsx";
import { Button } from "../ui/Button.tsx";
import { Card } from "../ui/Card.tsx";

function wageText(wage: WageProfile, lang: Lang, t: Translate): string {
  const value = hourlyRate(wage);
  if (wage.mode === "table") {
    const scale = findScale(wage.scale);
    const step = wage.step === 0 ? t("wage.minimum") : wage.step;
    return `${scale ? (lang === "ar" ? scale.ar : scale.en) : ""} · ${t("wage.grade")} ${wage.grade} · ${t("wage.step")} ${step} = ${rate(value)}`;
  }
  return value === null ? t("wage.none") : `${rate(value)} ${t("common.bhd")}`;
}

interface SheetReviewProps {
  result: Extract<SheetResult, { ok: true }>;
  schedules: Schedule[];
  defaultScheduleId: number;
  onCancel: () => void;
  onApplied: (count: number) => void;
}

/** What the uploaded sheet will change, and what could not be used, before anything is saved. */
export function SheetReview({ result, schedules, defaultScheduleId, onCancel, onApplied }: SheetReviewProps) {
  const { t, lang } = useLang();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const arrow = lang === "ar" ? "←" : "→";
  const defaultName = schedules.find((s) => s.id === defaultScheduleId)?.name ?? "";
  const scheduleText = (id: number | null) =>
    id === null ? t("employee.defaultSchedule", { name: defaultName }) : (schedules.find((s) => s.id === id)?.name ?? "");

  const apply = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await api.updateEmployees(result.updates.map((u) => ({ id: u.employee.id, update: u.update })));
      onApplied(res.updated);
    } catch (e) {
      setError(errorText(t, e));
      setBusy(false);
    }
  };

  return (
    <Card
      title={t("sheet.review")}
      description={t("sheet.summary", { updates: result.updates.length, unchanged: result.unchanged, problems: result.problems.length })}
      actions={
        <>
          <Button onClick={onCancel}>{t("common.cancel")}</Button>
          <Button variant="primary" icon={CircleCheck} loading={busy} disabled={!result.updates.length} onClick={() => void apply()}>
            {t("sheet.apply", { n: result.updates.length })}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <p className="text-xs text-slate-500">
          {t("sheet.columns", { list: result.columns.map((c) => SHEET_TITLES[c][lang]).join(lang === "ar" ? "، " : ", ") })}
        </p>

        {result.problems.length ? (
          <Alert tone="warning">
            <ul className="flex flex-col gap-1">
              {result.problems.map((p) => (
                <li key={`${p.row}-${p.code}`}>
                  <b className="font-semibold">
                    {t("sheet.row", { row: p.row })}
                    {p.id ? <span dir="ltr"> ({p.id})</span> : null}:
                  </b>{" "}
                  {t(`sheet.problem.${p.code}`, { value: p.value })}
                </li>
              ))}
            </ul>
          </Alert>
        ) : null}

        {result.updates.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">{t("sheet.nothing")}</p>
        ) : (
          <div className="max-h-[28rem] overflow-auto rounded-lg border border-slate-200">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("col.name")}</th>
                  <th>{t("col.cpr")}</th>
                  <th>{t("sheet.changes")}</th>
                </tr>
              </thead>
              <tbody>
                {result.updates.map(({ employee: e, update: u }) => {
                  const lines: [string, string, string][] = [];
                  if (u.fullName !== undefined) lines.push([t("employee.fullName"), e.fullName || "–", u.fullName]);
                  if (u.employeeNo !== undefined) lines.push([t("employee.employeeNo"), e.employeeNo || "–", u.employeeNo]);
                  if (u.department !== undefined) lines.push([t("employee.department"), e.department || "–", u.department]);
                  if (u.scheduleId !== undefined) lines.push([t("employee.schedule"), scheduleText(e.scheduleChoice), scheduleText(u.scheduleId)]);
                  if (u.wage) lines.push([t("wage.title"), wageText(e.wage, lang, t), wageText(u.wage, lang, t)]);
                  return (
                    <tr key={e.id}>
                      <td className="font-medium">{e.name}</td>
                      <td dir="ltr" className="text-start text-slate-600">
                        {e.id}
                      </td>
                      <td className="whitespace-normal">
                        <ul className="flex flex-col gap-0.5 text-sm">
                          {lines.map(([label, from, to]) => (
                            <li key={label}>
                              <span className="text-slate-500">{label}:</span> <span className="text-slate-400 line-through">{from}</span>{" "}
                              {arrow} <b className="font-medium text-slate-900">{to}</b>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}
