import { useState } from "react";
import { api } from "../api.ts";
import { errorText } from "../errors.ts";
import { useLang } from "../i18n/context.ts";
import { Alert } from "../ui/Alert.tsx";
import { Button } from "../ui/Button.tsx";
import { Dialog } from "../ui/Dialog.tsx";
import { Field } from "../ui/Field.tsx";

/** Names HR picks from, so the same holiday is spelled the same way every year. */
const NAMES = {
  ar: ["عيد الفطر", "عيد الأضحى", "يوم عرفة", "رأس السنة الهجرية", "عاشوراء", "المولد النبوي الشريف", "العيد الوطني", "عيد العمال", "رأس السنة الميلادية"],
  en: ["Eid al-Fitr", "Eid al-Adha", "Arafat Day", "Islamic New Year", "Ashura", "Prophet's Birthday", "National Day", "Labour Day", "New Year's Day"],
};

interface HolidayDialogProps {
  /** null keeps the dialog closed; "" opens it empty. */
  from: string | null;
  to?: string;
  onClose: () => void;
  onSaved: (days: number) => void;
}

/** Add a public holiday of one or more days; it applies to every employee. */
export function HolidayDialog({ from, to, onClose, onSaved }: HolidayDialogProps) {
  const { t } = useLang();
  return (
    <Dialog open={from !== null} onClose={onClose} title={t("holidays.add")} description={t("holidays.subtitle")}>
      {from !== null ? <HolidayForm key={from + (to ?? "")} initialFrom={from} initialTo={to ?? from} onClose={onClose} onSaved={onSaved} /> : null}
    </Dialog>
  );
}

interface HolidayFormProps {
  initialFrom: string;
  initialTo: string;
  onClose: () => void;
  onSaved: (days: number) => void;
}

function HolidayForm({ initialFrom, initialTo, onClose, onSaved }: HolidayFormProps) {
  const { t, lang } = useLang();
  const [name, setName] = useState(initialFrom ? t("holidays.default") : "");
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (to < from) return setError(t("error.invalid_period"));
    setBusy(true);
    setError("");
    try {
      const res = await api.addHoliday({ from, to, name: name.trim() });
      onSaved(res.days);
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
      <Field label={t("holidays.name")}>
        <input
          className="input"
          list="holiday-names"
          value={name}
          maxLength={80}
          required
          data-autofocus
          onFocus={(e) => e.target.select()}
          onChange={(e) => setName(e.target.value)}
        />
        <datalist id="holiday-names">
          {NAMES[lang].map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("common.from")}>
          <input
            type="date"
            className="input"
            value={from}
            required
            onChange={(e) => {
              setFrom(e.target.value);
              if (!to || to < e.target.value) setTo(e.target.value);
            }}
          />
        </Field>
        <Field label={t("common.to")} hint={t("holidays.rangeHint")}>
          <input type="date" className="input" value={to} min={from} required onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button type="submit" variant="primary" loading={busy}>
          {t("common.save")}
        </Button>
      </div>
    </form>
  );
}
