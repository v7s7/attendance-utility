import { ScrollText } from "lucide-react";
import { api } from "../api.ts";
import { timestamp } from "../format.ts";
import { hasKey, useLang } from "../i18n/context.ts";
import { Card } from "../ui/Card.tsx";
import { PageHeader } from "../ui/PageHeader.tsx";
import { Empty, Loading, LoadError } from "../ui/States.tsx";
import { useApi } from "../useApi.ts";

/** A short "key: value" summary of what changed, without nested objects. */
function details(d: Record<string, unknown>): string {
  return Object.entries(d)
    .filter(([, v]) => v !== null && v !== "" && typeof v !== "object")
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(" · ");
}

export function AuditPage() {
  const { t } = useLang();
  const audit = useApi("audit", api.audit);

  return (
    <>
      <PageHeader title={t("audit.title")} description={t("audit.subtitle")} />
      {audit.error ? (
        <LoadError error={audit.error} retry={audit.reload} />
      ) : !audit.data ? (
        <Loading />
      ) : (
        <Card flush>
          {audit.data.length === 0 ? (
            <Empty icon={ScrollText} title={t("common.none")} />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>{t("audit.when")}</th>
                  <th>{t("audit.who")}</th>
                  <th>{t("audit.what")}</th>
                  <th>{t("audit.target")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {audit.data.map((a) => {
                  const key = `audit.action.${a.action}`;
                  return (
                    <tr key={a.id}>
                      <td dir="ltr" className="text-start text-slate-600">
                        {timestamp(a.at)}
                      </td>
                      <td>{a.userName || "–"}</td>
                      <td className="font-medium">{hasKey(key) ? t(key) : a.action}</td>
                      <td dir="ltr" className="text-start text-slate-600">
                        {a.target}
                      </td>
                      <td className="max-w-md truncate text-xs text-slate-500" title={details(a.details)}>
                        {details(a.details)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </>
  );
}
