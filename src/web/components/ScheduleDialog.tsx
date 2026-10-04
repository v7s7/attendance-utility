import { useState } from "react";
import type { Schedule, ScheduleKind } from "../../core/types.ts";
import { api } from "../api.ts";
import { errorText } from "../errors.ts";
import { dayName } from "../format.ts";
import { useLang } from "../i18n/context.ts";
import { Alert } from "../ui/Alert.tsx";
import { Button } from "../ui/Button.tsx";
import { cx } from "../ui/cx.ts";
import { Dialog } from "../ui/Dialog.tsx";
import { Field } from "../ui/Field.tsx";
import { scheduleLines } from "./scheduleText.ts";

const KINDS: ScheduleKind[] = ["flexible", "fixed", "hours"];
const DURATION = /^\d{1,2}:[0-5]\d$/;

interface ScheduleDialogProps {
  /** The schedule to edit, a blank one for "new", or null when closed. */
  schedule: Schedule | Omit<Schedule, "id"> | null;
  onClose: () => void;
  onSaved: () => void;
}

export function ScheduleDialog({ schedule, onClose, onSaved }: ScheduleDialogProps) {
  const { t } = useLang();
  return (
    <Dialog open={schedule !== null} onClose={onClose} title={t("schedule.title")} size="lg">
      {schedule ? <ScheduleForm schedule={schedule} onClose={onClose} onSaved={onSaved} /> : null}
    </Dialog>
  );
}

function ScheduleForm({ schedule, onClose, onSaved }: { schedule: Schedule | Omit<Schedule, "id">; onClose: () => void; onSaved: () => void }) {
  const { t, lang } = useLang();
  const [draft, setDraft] = useState<Omit<Schedule, "id">>({
    name: schedule.name,
    kind: schedule.kind,
    start: schedule.start,
    latestStart: schedule.latestStart,
    hours: [...schedule.hours],
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = draft.name.trim() && draft.hours.every((h) => h === null || DURATION.test(h));

  const setHours = (day: number, value: string | null) =>
    setDraft((d) => ({ ...d, hours: d.hours.map((h, i) => (i === day ? value : h)) }));

  const save = async () => {
    if (!valid) return setError(t("error.invalid_input"));
    setBusy(true);
    setError("");
    try {
      const body = { ...draft, name: draft.name.trim(), latestStart: draft.kind === "flexible" ? draft.latestStart : draft.start };
      if ("id" in schedule) await api.updateSchedule(schedule.id, body);
      else await api.createSchedule(body);
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
      <Field label={t("schedule.name")}>
        <input className="input" value={draft.name} maxLength={60} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />
      </Field>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-700">{t("schedule.kind")}</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {KINDS.map((kind) => (
            <label
              key={kind}
              className={cx(
                "flex cursor-pointer flex-col gap-1 rounded-lg border p-3 transition",
                draft.kind === kind ? "border-teal-600 bg-teal-50/60 ring-1 ring-teal-600" : "border-slate-200 hover:border-slate-300",
              )}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <input type="radio" name="kind" className="accent-teal-700" checked={draft.kind === kind} onChange={() => setDraft({ ...draft, kind })} />
                {t(`schedule.kind.${kind}`)}
              </span>
              <span className="text-xs leading-relaxed text-slate-500">{t(`schedule.kindHint.${kind}`)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("schedule.start")}>
          <input type="time" className="input" value={draft.start} onChange={(e) => e.target.value && setDraft({ ...draft, start: e.target.value })} />
        </Field>
        {draft.kind === "flexible" ? (
          <Field label={t("schedule.latestStart")}>
            <input type="time" className="input" value={draft.latestStart} onChange={(e) => e.target.value && setDraft({ ...draft, latestStart: e.target.value })} />
          </Field>
        ) : null}
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-700">{t("schedule.hours")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {draft.hours.map((h, day) => (
            <div key={day} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
              <span className="w-20 text-sm font-medium">{dayName(day, lang)}</span>
              <input
                className={cx("input h-8 w-24", h !== null && !DURATION.test(h) && "input-invalid")}
                dir="ltr"
                placeholder="07:15"
                disabled={h === null}
                value={h ?? ""}
                onChange={(e) => setHours(day, e.target.value)}
              />
              <label className="ms-auto flex items-center gap-1.5 text-xs text-slate-600">
                <input type="checkbox" className="accent-teal-700" checked={h === null} onChange={(e) => setHours(day, e.target.checked ? null : "07:15")} />
                {t("schedule.dayOff")}
              </label>
            </div>
          ))}
        </div>
      </fieldset>

      {valid ? (
        <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {scheduleLines({ ...draft, id: 0 }, t, lang).map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      ) : null}

      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button type="submit" variant="primary" loading={busy}>
          {t("common.save")}
        </Button>
      </div>
    </form>
  );
}
