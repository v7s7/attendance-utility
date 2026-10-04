import { useState } from "react";
import { lastDayOfMonth } from "../../core/time.ts";
import { EXCUSES, type Excuse } from "../../core/types.ts";
import { api } from "../api.ts";
import { errorText } from "../errors.ts";
import { useLang } from "../i18n/context.ts";
import { Alert } from "../ui/Alert.tsx";
import { Button } from "../ui/Button.tsx";
import { Dialog } from "../ui/Dialog.tsx";
import { Field } from "../ui/Field.tsx";

interface LeaveDialogProps {
  open: boolean;
  employeeId: string;
  month: string;
  onClose: () => void;
  onSaved: () => void;
}

/** Record leave or another excuse on every working day in a date range. */
export function LeaveDialog({ open, employeeId, month, onClose, onSaved }: LeaveDialogProps) {
  const { t } = useLang();
  return (
    <Dialog open={open} onClose={onClose} title={t("leave.title")} description={t("leave.hint")}>
      <LeaveForm employeeId={employeeId} month={month} onClose={onClose} onSaved={onSaved} />
    </Dialog>
  );
}

function LeaveForm({ employeeId, month, onClose, onSaved }: Omit<LeaveDialogProps, "open">) {
  const { t } = useLang();
  const [from, setFrom] = useState(`${month}-01`);
  const [to, setTo] = useState(lastDayOfMonth(month));
  const [excuse, setExcuse] = useState<Excuse>("annual");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setError("");
    if (from > to) return setError(t("error.invalid_period"));
    setBusy(true);
    try {
      await api.addLeave(employeeId, { from, to, excuse, note: note.trim() });
      onSaved();
      onClose();
    } catch (e) {
      setError(errorText(t, e));
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label={t("leave.type")}>
        <select className="input" value={excuse} onChange={(e) => setExcuse(e.target.value as Excuse)}>
          {EXCUSES.map((x) => (
            <option key={x} value={x}>
              {t(`excuse.${x}`)}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("common.from")}>
          <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} required />
        </Field>
        <Field label={t("common.to")}>
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} required />
        </Field>
      </div>
      <Field label={t("day.note")}>
        <input className="input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button type="submit" variant="primary" loading={busy}>
          {t("common.save")}
        </Button>
      </div>
    </form>
  );
}
