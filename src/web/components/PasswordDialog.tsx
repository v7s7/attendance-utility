import { useState } from "react";
import { api } from "../api.ts";
import { errorText } from "../errors.ts";
import { useLang } from "../i18n/context.ts";
import { Alert } from "../ui/Alert.tsx";
import { Button } from "../ui/Button.tsx";
import { Dialog } from "../ui/Dialog.tsx";
import { Field } from "../ui/Field.tsx";

export function PasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useLang();
  return (
    <Dialog open={open} onClose={onClose} title={t("password.title")}>
      <PasswordForm onClose={onClose} />
    </Dialog>
  );
}

function PasswordForm({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError("");
    if (next !== confirm) return setError(t("account.mismatch"));
    setBusy(true);
    try {
      await api.changePassword(current, next);
      setDone(true);
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success">{t("password.done")}</Alert>
        <Button onClick={onClose} className="self-end">
          {t("common.close")}
        </Button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label={t("password.current")}>
        <input className="input" dir="ltr" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </Field>
      <Field label={t("password.next")} hint={t("account.passwordHint")}>
        <input className="input" dir="ltr" type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required />
      </Field>
      <Field label={t("account.confirm")}>
        <input className="input" dir="ltr" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </Field>
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button type="submit" variant="primary" loading={busy}>
          {t("common.save")}
        </Button>
      </div>
    </form>
  );
}
