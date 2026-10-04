import { BookOpen, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Lock, Upload } from "lucide-react";
import { api } from "../api.ts";
import { bhd, duration, monthName } from "../format.ts";
import { useLang } from "../i18n/context.ts";
import { navigate, paths } from "../router.ts";
import { Badge } from "../ui/Badge.tsx";
import { Button } from "../ui/Button.tsx";
import { Card } from "../ui/Card.tsx";
import { Link } from "../ui/Link.tsx";
import { PageHeader } from "../ui/PageHeader.tsx";
import { Empty, Loading, LoadError } from "../ui/States.tsx";
import { useApi } from "../useApi.ts";

export function MonthsPage() {
  const { t, lang } = useLang();
  const months = useApi("months", api.months);
  const Chevron = lang === "ar" ? ChevronLeft : ChevronRight;

  // The last three months with data (newest first in the list)
  const recent = months.data?.slice(0, 3).map((m) => m.month) ?? [];
  const periodButton =
    recent.length > 1 ? (
      <Link href={paths.period(recent[recent.length - 1], recent[0])}>
        <Button icon={CalendarRange}>{t("period.open")}</Button>
      </Link>
    ) : null;

  const importButton = (
    <Link href={paths.import()}>
      <Button variant="primary" icon={Upload}>
        {t("months.import")}
      </Button>
    </Link>
  );

  return (
    <>
      <PageHeader
        title={t("months.title")}
        description={t("months.subtitle")}
        actions={
          <>
            {periodButton}
            {importButton}
          </>
        }
      />

      {months.error ? (
        <LoadError error={months.error} retry={months.reload} />
      ) : !months.data ? (
        <Loading />
      ) : months.data.length === 0 ? (
        <Card>
          <Empty
            icon={CalendarDays}
            title={t("months.empty.title")}
            text={t("months.empty.text")}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {importButton}
                <Link href={paths.help()}>
                  <Button icon={BookOpen}>{t("nav.help")}</Button>
                </Link>
              </div>
            }
          />
        </Card>
      ) : (
        <Card flush>
          <table className="table">
            <thead>
              <tr>
                <th>{t("col.month")}</th>
                <th>{t("col.employees")}</th>
                <th>{t("col.review")}</th>
                <th>{t("col.missingWage")}</th>
                <th>{t("col.deductible")}</th>
                <th>{t("col.deduction")}</th>
                <th>{t("col.state")}</th>
                <th aria-hidden />
              </tr>
            </thead>
            <tbody>
              {months.data.map((m) => (
                <tr key={m.month} onClick={() => navigate(paths.month(m.month))} className="cursor-pointer hover:bg-slate-50">
                  <td>
                    <Link href={paths.month(m.month)} className="font-semibold text-slate-900 hover:text-teal-700">
                      {monthName(m.month, lang)}
                    </Link>
                  </td>
                  <td>{m.employees}</td>
                  <td>{m.needsReview ? <Badge tone="violet">{m.needsReview}</Badge> : <span className="text-slate-400">0</span>}</td>
                  <td>{m.missingWage ? <Badge tone="danger">{m.missingWage}</Badge> : <span className="text-slate-400">0</span>}</td>
                  <td dir="ltr" className="text-start">
                    {duration(m.deductibleMin)}
                  </td>
                  <td className="font-semibold">
                    {m.missingWage === m.employees ? (
                      <span className="text-slate-400">–</span>
                    ) : (
                      <>
                        <span dir="ltr">{bhd(m.deductionFils)}</span> <span className="text-xs font-normal text-slate-500">{t("common.bhd")}</span>
                      </>
                    )}
                  </td>
                  <td>
                    {m.locked ? (
                      <Badge tone="neutral">
                        <Lock className="size-3" />
                        {t("state.locked")}
                      </Badge>
                    ) : (
                      <Badge tone="teal">{t("state.open")}</Badge>
                    )}
                  </td>
                  <td className="w-8 text-slate-400">
                    <Chevron className="size-4" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
