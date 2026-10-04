import { LoaderCircle, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { errorText } from "../errors.ts";
import { useLang } from "../i18n/context.ts";
import { Alert } from "./Alert.tsx";
import { Button } from "./Button.tsx";

export function Loading() {
  const { t } = useLang();
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
      <LoaderCircle className="size-4 animate-spin" />
      {t("common.loading")}
    </div>
  );
}

export function LoadError({ error, retry }: { error: unknown; retry: () => void }) {
  const { t } = useLang();
  return (
    <Alert
      tone="danger"
      action={
        <Button size="sm" onClick={retry}>
          {t("common.retry")}
        </Button>
      }
    >
      {errorText(t, error)}
    </Alert>
  );
}

interface EmptyProps {
  icon: LucideIcon;
  title: ReactNode;
  text?: ReactNode;
  action?: ReactNode;
}

export function Empty({ icon: Icon, title, text, action }: EmptyProps) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-teal-50 text-teal-700">
        <Icon className="size-6" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-slate-900">{title}</h3>
      {text ? <p className="mt-1 max-w-md text-sm leading-relaxed text-slate-500">{text}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
