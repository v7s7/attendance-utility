import { useEffect, useRef, useState } from "react";
import { parseTypedTime } from "../../core/time.ts";
import { EXCUSES, type DayResult, type Excuse } from "../../core/types.ts";
import { api } from "../api.ts";
import { errorText } from "../errors.ts";
import { clock, date, dayName } from "../format.ts";
import { useLang } from "../i18n/context.ts";
import { Alert } from "../ui/Alert.tsx";
import { Button } from "../ui/Button.tsx";
import { Dialog } from "../ui/Dialog.tsx";
import { Field } from "../ui/Field.tsx";
import { TimeInput } from "../ui/TimeInput.tsx";
import { dayNotes } from "./dayText.ts";

interface DayDialogProps {
  employeeId: string;
  day: DayResult | null;
  /** The next day that needs attention, for "Save and next". */
  next?: DayResult | null;
  onClose: () => void;
  onSaved: () => void;
  onNext?: (day: DayResult) => void;
}

/** HR's record for one day: times from the manual register, an excuse and a note. */
export function DayDialog({ employeeId, day, next, onClose, onSaved, onNext }: DayDialogProps) {
  const { t, lang } = useLang();
  return (
    <Dialog
      open={day !== null}
      onClose={onClose}
      title={day ? t("day.title", { day: dayName(day.weekday, lang), date: date(day.date) }) : ""}
    >
      {day ? (
        <DayForm
          key={day.date}
          employeeId={employeeId}
          day={day}
          onClose={onClose}
          onSaved={onSaved}
          onNext={next && onNext ? () => onNext(next) : undefined}
        />
      ) : null}
    </Dialog>
  );
}

interface DayFormProps {
  employeeId: string;
  day: DayResult;
  onClose: () => void;
  onSaved: () => void;
  onNext?: () => void;
}

function DayForm({ employeeId, day, onClose, onSaved, onNext }: DayFormProps) {
  const { t } = useLang();
  const [inTime, setInTime] = useState(day.inManual ? clock(day.inTime) : "");
  const [outTime, setOutTime] = useState(day.outManual ? clock(day.outTime) : "");
  // The excuse, or "salary": an absence HR deducts from the salary
  const [excuse, setExcuse] = useState<Excuse | "salary" | "">(day.absence ?? day.excuse ?? "");
  const [note, setNote] = useState(day.note);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const edited = day.inManual || day.outManual || day.excuse !== null || day.absence !== null || day.note !== "";
  const notes = dayNotes(day, t);
  const formRef = useRef<HTMLFormElement>(null);
  const parsedIn = parseTypedTime(inTime);
  const outAfter = parsedIn || day.deviceIn;

  const save = async (clear = false, goNext = false) => {
    const parsedOut = parseTypedTime(outTime, outAfter);
    if (!clear && (parsedIn === null || parsedOut === null)) return setError(t("review.badTime"));
    setBusy(true);
    setError("");
    try {
      await api.saveDay(
        employeeId,
        day.date,
        clear
          ? { inTime: null, outTime: null, excuse: null, note: "" }
          : {
              inTime: parsedIn || null,
              outTime: parsedOut || null,
              excuse: excuse === "salary" ? null : excuse || null,
              absence: excuse === "salary" ? "salary" : null,
              note: note.trim(),
            },
      );
      onSaved();
      if (goNext && onNext) onNext();
      else onClose();
    } catch (e) {
      setError(errorText(t, e));
      setBusy(false);
    }
  };

  // After "Save and next" the window stays open with the next day: put the cursor in its missing time
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, []);

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save(false, Boolean(onNext));
      }}
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {notes.length ? <Alert tone="info">{notes.join(" · ")}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("day.in")} hint={day.deviceIn ? t("day.device", { time: clock(day.deviceIn) }) : t("day.deviceNone")}>
          <TimeInput value={inTime} onChange={setInTime} data-autofocus={!day.deviceIn || undefined} />
        </Field>
        <Field label={t("day.out")} hint={day.deviceOut ? t("day.device", { time: clock(day.deviceOut) }) : t("day.deviceNone")}>
          <TimeInput value={outTime} onChange={setOutTime} after={outAfter} data-autofocus={(day.deviceIn && !day.deviceOut) || undefined} />
        </Field>
      </div>

      <Field label={t("day.excuse")}>
        <select className="input" value={excuse} onChange={(e) => setExcuse(e.target.value as Excuse | "salary" | "")}>
          <option value="">{t("day.noExcuse")}</option>
          <option value="salary">{t("absence.option")}</option>
          {EXCUSES.map((x) => (
            <option key={x} value={x}>
              {t(`excuse.${x}`)}
            </option>
          ))}
        </select>
      </Field>

      <Field label={t("day.note")} hint={t("day.hint")}>
        <input className="input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      </Field>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
        {edited ? (
          <Button variant="danger" onClick={() => void save(true)} disabled={busy}>
            {t("day.clear")}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          {onNext ? (
            <>
              <Button onClick={() => void save()} disabled={busy}>
                {t("common.save")}
              </Button>
              <Button type="submit" variant="primary" loading={busy}>
                {t("day.saveNext")}
              </Button>
            </>
          ) : (
            <Button type="submit" variant="primary" loading={busy}>
              {t("common.save")}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
