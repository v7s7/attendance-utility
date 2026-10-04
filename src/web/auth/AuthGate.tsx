import { Clock3, Languages } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "../../core/api.ts";
import { api, setUnauthorizedHandler } from "../api.ts";
import { errorText } from "../errors.ts";
import { useLang } from "../i18n/context.ts";
import { Alert } from "../ui/Alert.tsx";
import { Button } from "../ui/Button.tsx";
import { Field } from "../ui/Field.tsx";
import { Loading, LoadError } from "../ui/States.tsx";
import { AuthContext } from "./context.ts";

type Status = { user: User | null };

/** Shows the sign-in page until someone is signed in. Accounts are created by IT; there is no sign-up. */
export function AuthGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.status().then(
      (s) => !cancelled && setStatus(s),
      (e: unknown) => !cancelled && setError(e),
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    setUnauthorizedHandler(() => setStatus((s) => (s ? { ...s, user: null } : s)));
  }, []);

  const auth = useMemo(
    () =>
      status?.user
        ? {
            user: status.user,
            isAdmin: status.user.role === "admin",
            signOut: async () => {
              await api.logout().catch(() => undefined);
              setStatus({ user: null });
            },
          }
        : null,
    [status],
  );

  if (error && !status) {
    return (
      <CenteredCard>
        <LoadError
          error={error}
          retry={() => {
            setError(null);
            setAttempt((n) => n + 1);
          }}
        />
      </CenteredCard>
    );
  }
  if (!status) return <Loading />;
  if (!auth) {
    return <SignIn onSignedIn={(user) => setStatus({ user })} />;
  }
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

function CenteredCard({ children }: { children: ReactNode }) {
  const { t, lang, setLang } = useLang();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-10">
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="flex size-12 items-center justify-center rounded-xl bg-teal-700 text-white shadow-sm">
          <Clock3 className="size-6" />
        </div>
        <div className="mt-3 text-lg font-semibold text-slate-900">{t("app.name")}</div>
        <div className="text-sm text-slate-500">{t("app.tagline")}</div>
      </div>
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">{children}</div>
      <button
        type="button"
        onClick={() => setLang(lang === "ar" ? "en" : "ar")}
        className="mt-6 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
      >
        <Languages className="size-4" />
        {t("nav.language")}
      </button>
    </div>
  );
}

function SignIn({ onSignedIn }: { onSignedIn: (user: User) => void }) {
  const { t } = useLang();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      const { user } = await api.login(username, password);
      onSignedIn(user);
    } catch (e) {
      setError(errorText(t, e));
      setBusy(false);
    }
  };

  return (
    <CenteredCard>
      <h1 className="text-lg font-semibold text-slate-900">{t("login.title")}</h1>
      <p className="mt-1 text-sm leading-relaxed text-slate-500">{t("login.subtitle")}</p>
      <form
        className="mt-5 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Field label={t("login.username")}>
          <input
            className="input"
            dir="ltr"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
          />
        </Field>
        <Field label={t("login.password")}>
          <input
            className="input"
            dir="ltr"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        <Button type="submit" variant="primary" loading={busy} className="mt-1 w-full">
          {t("login.submit")}
        </Button>
      </form>
      <p className="mt-5 border-t border-slate-100 pt-4 text-center text-xs text-slate-500">{t("login.noAccount")}</p>
    </CenteredCard>
  );
}
